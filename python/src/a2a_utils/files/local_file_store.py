"""LocalFileStore — filesystem-backed file storage."""

import asyncio
import base64
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
import ipaddress
from pathlib import Path
import re
import shutil
import socket
import ssl
from typing import Any
import zlib
from urllib.parse import SplitResult

from a2a.types import Artifact, FilePart, FileWithBytes, FileWithUri, Message, Part

from a2a_utils.storage import (
    assert_safe_storage_id,
    normalize_allowed_uri_schemes,
    parse_remote_file_uri,
    safe_join,
)

from .file_store import FileStore

LocalFileStoreFetchResult = bytes | bytearray | memoryview
LocalFileStoreFetchFileUri = Callable[[str], Awaitable[LocalFileStoreFetchResult]]


@dataclass(frozen=True)
class _ResolvedRemoteAddress:
    address: str
    family: socket.AddressFamily


@dataclass(frozen=True)
class _HTTPResponse:
    status_code: int
    reason_phrase: str
    headers: dict[str, str]
    body: bytes


class LocalFileStore(FileStore):
    """Store artifact and message files on the local filesystem.

    Artifacts are saved to ``storage_dir/artifacts/task_id/artifact_id/filename``.
    Messages are saved to ``storage_dir/messages/message_id/filename``.
    """

    def __init__(
        self,
        storage_dir: Path,
        *,
        fetch_file_uri: LocalFileStoreFetchFileUri | None = None,
        allowed_uri_schemes: Sequence[str] | None = None,
        max_remote_bytes: int | None = None,
    ) -> None:
        self._storage_dir = safe_join(storage_dir)
        self._artifact_root = safe_join(self._storage_dir, "artifacts")
        self._message_root = safe_join(self._storage_dir, "messages")
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._allowed_uri_schemes = frozenset(normalize_allowed_uri_schemes(allowed_uri_schemes))
        self._max_remote_bytes = (
            max_remote_bytes
            if isinstance(max_remote_bytes, int) and max_remote_bytes > 0
            else self._DEFAULT_MAX_REMOTE_BYTES
        )
        self._fetch_file_uri = fetch_file_uri or self._default_fetch_file_uri

    async def _save_file_parts(self, parts: list[Part], target_dir: Path) -> list[str]:
        """Save FilePart entries from a list of parts to a target directory.

        Returns list of local file paths where files were saved.
        """
        saved_paths: list[str] = []

        for i, part in enumerate(parts):
            if not isinstance(part.root, FilePart):
                continue

            file_obj = part.root.file
            name = Path(file_obj.name).name if file_obj.name else f"file_{i}"
            name = name.replace("..", "").lstrip(".")
            if not name:
                name = f"file_{i}"

            async with self._lock:
                target_dir.mkdir(parents=True, exist_ok=True)
                file_path = safe_join(target_dir, name)

                if isinstance(file_obj, FileWithBytes):
                    data = base64.b64decode(file_obj.bytes)
                    file_path.write_bytes(data)
                elif isinstance(file_obj, FileWithUri):
                    data = bytes(await self._fetch_remote_file_part(file_obj.uri))
                    file_path.write_bytes(data)

                saved_paths.append(str(file_path))

        return saved_paths

    async def save_artifact(self, task_id: str, artifact: Artifact) -> list[str]:
        """Save file parts from an artifact to disk.

        Returns list of local file paths where files were saved.
        """
        artifact_dir = self._get_artifact_dir(task_id, artifact.artifact_id)
        return await self._save_file_parts(artifact.parts, artifact_dir)

    async def get_artifact(self, task_id: str, artifact_id: str) -> list[str]:
        """Get file paths for a saved artifact.

        Returns list of paths, or empty list if directory does not exist.
        """
        artifact_dir = self._get_artifact_dir(task_id, artifact_id)
        if not artifact_dir.exists():
            return []
        return sorted(str(p) for p in artifact_dir.iterdir() if p.is_file())

    async def delete_artifact(self, task_id: str, artifact_id: str) -> None:
        """Delete saved files for an artifact."""
        artifact_dir = self._get_artifact_dir(task_id, artifact_id)
        if artifact_dir.exists():
            shutil.rmtree(artifact_dir)

    async def save_message(self, message: Message) -> list[str]:
        """Save file parts from a message to disk.

        Returns list of local file paths where files were saved.
        """
        message_dir = self._get_message_dir(message.message_id)
        return await self._save_file_parts(message.parts, message_dir)

    async def get_message(self, message_id: str) -> list[str]:
        """Get file paths for a saved message.

        Returns list of paths, or empty list if directory does not exist.
        """
        message_dir = self._get_message_dir(message_id)
        if not message_dir.exists():
            return []
        return sorted(str(p) for p in message_dir.iterdir() if p.is_file())

    async def delete_message(self, message_id: str) -> None:
        """Delete saved files for a message."""
        message_dir = self._get_message_dir(message_id)
        if message_dir.exists():
            shutil.rmtree(message_dir)

    def _get_artifact_dir(self, task_id: str, artifact_id: str) -> Path:
        assert_safe_storage_id("task id", task_id)
        assert_safe_storage_id("artifact id", artifact_id)
        return safe_join(self._artifact_root, task_id, artifact_id)

    def _get_message_dir(self, message_id: str) -> Path:
        assert_safe_storage_id("message id", message_id)
        return safe_join(self._message_root, message_id)

    async def _fetch_remote_file_part(self, uri: str) -> bytes:
        url = self._parse_remote_url(uri)
        data = await self._fetch_file_uri(url.geturl())
        result = bytes(data)
        if len(result) > self._max_remote_bytes:
            raise ValueError(
                "Remote file exceeds max_remote_bytes "
                f"{self._max_remote_bytes}: {len(result)} bytes"
            )
        return result

    async def _default_fetch_file_uri(self, uri: str) -> bytes:
        visited: set[str] = set()
        current_url = self._parse_remote_url(uri)

        for _ in range(self._DEFAULT_MAX_REDIRECTS + 1):
            current_url_string = current_url.geturl()
            if current_url_string in visited:
                raise ValueError(f"Redirect loop while fetching '{uri}'")
            visited.add(current_url_string)

            resolved_address = await self._resolve_remote_address(current_url)
            response = await self._request_remote_url(current_url, resolved_address)
            if self._is_redirect_status(response.status_code):
                location = response.headers.get("location")
                if not location:
                    raise ValueError(
                        f"Redirect response missing location for '{current_url_string}'"
                    )
                current_url = self._parse_remote_url(location, current_url.geturl())
                continue

            if not 200 <= response.status_code < 300:
                raise ValueError(f"HTTP {response.status_code}: {response.reason_phrase}")

            return self._decode_http_body(response.body, response.headers.get("content-encoding"))

        raise ValueError(f"Too many redirects while fetching '{uri}'")

    def _parse_remote_url(self, uri: str, base: str | None = None) -> SplitResult:
        return parse_remote_file_uri(
            uri, base=base, allowed_schemes=tuple(self._allowed_uri_schemes)
        )

    async def _resolve_remote_address(self, url: SplitResult) -> _ResolvedRemoteAddress:
        hostname = self._normalize_host_token(url.hostname or "")
        if self._is_blocked_host(hostname) or self._is_blocked_ip_address(hostname):
            raise ValueError(f"Blocked remote file host: '{hostname}'")

        port = url.port or (443 if url.scheme.lower() == "https" else 80)
        loop = asyncio.get_running_loop()
        try:
            infos = await loop.getaddrinfo(
                hostname,
                port,
                type=socket.SOCK_STREAM,
                proto=socket.IPPROTO_TCP,
            )
        except socket.gaierror as exc:
            raise ValueError(f"Failed to resolve remote file host: '{hostname}'") from exc

        allowed_addresses: list[_ResolvedRemoteAddress] = []
        for family, _, _, _, sockaddr in infos:
            if family not in {socket.AF_INET, socket.AF_INET6}:
                continue

            address = sockaddr[0]
            if self._is_blocked_ip_address(address):
                raise ValueError(f"Blocked remote file host: '{hostname}'")

            allowed_addresses.append(_ResolvedRemoteAddress(address=address, family=family))

        if not allowed_addresses:
            raise ValueError(f"Failed to resolve remote file host: '{hostname}'")

        return allowed_addresses[0]

    async def _request_remote_url(
        self, url: SplitResult, resolved_address: _ResolvedRemoteAddress
    ) -> _HTTPResponse:
        port = url.port or (443 if url.scheme.lower() == "https" else 80)
        ssl_context: ssl.SSLContext | None = None
        server_hostname: str | None = None
        if url.scheme.lower() == "https":
            ssl_context = ssl.create_default_context()
            server_hostname = self._normalize_host_token(url.hostname or "")

        reader, writer = await asyncio.open_connection(
            host=resolved_address.address,
            port=port,
            family=resolved_address.family,
            ssl=ssl_context,
            server_hostname=server_hostname,
        )

        request_target = url.path or "/"
        if url.query:
            request_target = f"{request_target}?{url.query}"

        host_header = url.netloc
        request = (
            f"GET {request_target} HTTP/1.1\r\n"
            f"Host: {host_header}\r\n"
            "Accept: */*\r\n"
            "Accept-Encoding: identity\r\n"
            "Connection: close\r\n"
            "\r\n"
        )

        try:
            writer.write(request.encode("ascii"))
            await writer.drain()
            return await self._read_http_response(reader)
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:
                pass

    async def _read_http_response(self, reader: asyncio.StreamReader) -> _HTTPResponse:
        status_line_bytes = await reader.readline()
        if not status_line_bytes:
            raise ValueError("Remote file response missing status line")

        status_line = status_line_bytes.decode("iso-8859-1").rstrip("\r\n")
        match = self._STATUS_LINE_RE.match(status_line)
        if match is None:
            raise ValueError(f"Invalid remote file response status line: '{status_line}'")

        status_code = int(match.group(1))
        reason_phrase = match.group(2) or ""
        headers = await self._read_http_headers(reader)
        body = await self._read_http_body(reader, headers, status_code)
        return _HTTPResponse(
            status_code=status_code,
            reason_phrase=reason_phrase,
            headers=headers,
            body=body,
        )

    async def _read_http_headers(self, reader: asyncio.StreamReader) -> dict[str, str]:
        headers: dict[str, str] = {}

        while True:
            line_bytes = await reader.readline()
            if not line_bytes:
                raise ValueError("Remote file response ended before headers completed")

            line = line_bytes.decode("iso-8859-1").rstrip("\r\n")
            if line == "":
                return headers

            name, separator, value = line.partition(":")
            if separator == "":
                raise ValueError(f"Invalid remote file response header: '{line}'")

            headers[name.strip().lower()] = value.strip()

    async def _read_http_body(
        self, reader: asyncio.StreamReader, headers: dict[str, str], status_code: int
    ) -> bytes:
        if 100 <= status_code < 200 or status_code in {204, 304}:
            return b""

        transfer_encoding = headers.get("transfer-encoding", "")
        if "chunked" in transfer_encoding.lower():
            return await self._read_chunked_body(reader)

        content_length = headers.get("content-length")
        if content_length is not None:
            try:
                expected_length = int(content_length)
            except ValueError as exc:
                raise ValueError(f"Invalid content-length header: '{content_length}'") from exc

            if expected_length > self._max_remote_bytes:
                raise ValueError(
                    "Remote file exceeds max_remote_bytes "
                    f"{self._max_remote_bytes}: {expected_length} bytes"
                )

            return await self._read_exact_body(reader, expected_length)

        return await self._read_body_to_eof(reader)

    async def _read_exact_body(self, reader: asyncio.StreamReader, size: int) -> bytes:
        if size == 0:
            return b""

        try:
            body = await reader.readexactly(size)
        except asyncio.IncompleteReadError as exc:
            raise ValueError("Remote file response body ended unexpectedly") from exc

        return body

    async def _read_body_to_eof(self, reader: asyncio.StreamReader) -> bytes:
        chunks: list[bytes] = []
        total = 0

        while chunk := await reader.read(65536):
            total += len(chunk)
            if total > self._max_remote_bytes:
                raise ValueError(
                    f"Remote file exceeds max_remote_bytes {self._max_remote_bytes}: {total} bytes"
                )

            chunks.append(chunk)

        return b"".join(chunks)

    async def _read_chunked_body(self, reader: asyncio.StreamReader) -> bytes:
        chunks: list[bytes] = []
        total = 0

        while True:
            line_bytes = await reader.readline()
            if not line_bytes:
                raise ValueError("Chunked remote file response ended unexpectedly")

            line = line_bytes.decode("iso-8859-1").strip()
            size_text = line.split(";", 1)[0]
            try:
                chunk_size = int(size_text, 16)
            except ValueError as exc:
                raise ValueError(f"Invalid chunk size: '{size_text}'") from exc

            if chunk_size == 0:
                await self._read_http_headers(reader)
                return b"".join(chunks)

            total += chunk_size
            if total > self._max_remote_bytes:
                raise ValueError(
                    f"Remote file exceeds max_remote_bytes {self._max_remote_bytes}: {total} bytes"
                )

            try:
                chunk = await reader.readexactly(chunk_size)
                line_ending = await reader.readexactly(2)
            except asyncio.IncompleteReadError as exc:
                raise ValueError("Chunked remote file response ended unexpectedly") from exc

            if line_ending != b"\r\n":
                raise ValueError("Chunked remote file response is missing CRLF delimiters")

            chunks.append(chunk)

    def _decode_http_body(self, body: bytes, content_encoding: str | None) -> bytes:
        decoded = body
        encodings = self._parse_content_encodings(content_encoding)

        for encoding in reversed(encodings):
            decoded = self._decode_http_body_once(decoded, encoding)

        return decoded

    def _decode_http_body_once(self, body: bytes, encoding: str) -> bytes:
        if encoding == "identity":
            return body
        if encoding in {"gzip", "x-gzip"}:
            return self._decompress_zlib_stream(
                body, lambda: zlib.decompressobj(16 + zlib.MAX_WBITS)
            )
        if encoding == "deflate":
            try:
                return self._decompress_zlib_stream(
                    body, lambda: zlib.decompressobj(zlib.MAX_WBITS)
                )
            except zlib.error:
                return self._decompress_zlib_stream(
                    body, lambda: zlib.decompressobj(-zlib.MAX_WBITS)
                )
        raise ValueError(f"Unsupported remote file content encoding: '{encoding}'")

    def _decompress_zlib_stream(self, body: bytes, factory: Callable[[], Any]) -> bytes:
        decompressor = factory()
        chunks: list[bytes] = []
        total = 0
        chunk_size = 64 * 1024

        for offset in range(0, len(body), chunk_size):
            piece = body[offset : offset + chunk_size]
            chunk = decompressor.decompress(piece, self._max_remote_bytes - total + 1)
            total += len(chunk)
            if total > self._max_remote_bytes or decompressor.unconsumed_tail:
                raise ValueError(
                    f"Remote file exceeds max_remote_bytes {self._max_remote_bytes}: {total} bytes"
                )
            chunks.append(chunk)

        tail = decompressor.flush(self._max_remote_bytes - total + 1)
        total += len(tail)
        if total > self._max_remote_bytes:
            raise ValueError(
                f"Remote file exceeds max_remote_bytes {self._max_remote_bytes}: {total} bytes"
            )
        chunks.append(tail)
        return b"".join(chunks)

    @staticmethod
    def _normalize_host_token(value: str) -> str:
        normalized = value.strip().lower()
        if normalized.startswith("[") and normalized.endswith("]"):
            normalized = normalized[1:-1]
        return normalized.rstrip(".")

    @staticmethod
    def _parse_content_encodings(value: str | None) -> tuple[str, ...]:
        if value is None:
            return ()
        return tuple(entry.strip().lower() for entry in value.split(",") if entry.strip() != "")

    @staticmethod
    def _looks_like_unsupported_ipv4_literal(address: str) -> bool:
        parts = address.split(".")
        if len(parts) == 0 or len(parts) > 4:
            return False
        if any(part == "" for part in parts):
            return True
        return all(
            re.fullmatch(r"[0-9]+", part) or re.fullmatch(r"0x[0-9a-f]+", part, re.IGNORECASE)
            for part in parts
        )

    @classmethod
    def _extract_mapped_ipv4(cls, address: str) -> str | None:
        normalized = cls._normalize_host_token(address)
        try:
            parsed = ipaddress.ip_address(normalized)
        except ValueError:
            return None

        if isinstance(parsed, ipaddress.IPv6Address) and parsed.ipv4_mapped is not None:
            return str(parsed.ipv4_mapped)
        return None

    @classmethod
    def _is_blocked_host(cls, hostname: str) -> bool:
        normalized = cls._normalize_host_token(hostname)
        if normalized == "":
            return True
        if normalized in cls._BLOCKED_HOSTNAMES:
            return True
        if (
            normalized.endswith(".localhost")
            or normalized.endswith(".local")
            or normalized.endswith(".internal")
        ):
            return True
        if cls._looks_like_unsupported_ipv4_literal(normalized):
            return True
        return False

    @classmethod
    def _is_blocked_ip_address(cls, address: str) -> bool:
        normalized = cls._normalize_host_token(address)
        if normalized == "":
            return True

        mapped_ipv4 = cls._extract_mapped_ipv4(normalized)
        if mapped_ipv4 is not None:
            parsed_ipv4 = ipaddress.ip_address(mapped_ipv4)
            return any(parsed_ipv4 in network for network in cls._BLOCKED_IPV4_NETWORKS)

        try:
            parsed = ipaddress.ip_address(normalized)
        except ValueError:
            return ":" in normalized

        networks = (
            cls._BLOCKED_IPV4_NETWORKS
            if isinstance(parsed, ipaddress.IPv4Address)
            else cls._BLOCKED_IPV6_NETWORKS
        )
        return any(parsed in network for network in networks)

    @staticmethod
    def _is_redirect_status(status_code: int) -> bool:
        return status_code in {301, 302, 303, 307, 308}

    _DEFAULT_ALLOWED_URI_SCHEMES = ("https:",)
    _DEFAULT_MAX_REMOTE_BYTES = 10 * 1024 * 1024
    _DEFAULT_MAX_REDIRECTS = 5
    _BLOCKED_HOSTNAMES = frozenset(
        {
            "localhost",
            "localhost.localdomain",
            "metadata.google.internal",
            "instance-data",
            "instance-data.ec2.internal",
        }
    )
    _BLOCKED_IPV4_NETWORKS = (
        ipaddress.ip_network("0.0.0.0/8"),
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("100.64.0.0/10"),
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("169.254.0.0/16"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.0.0.0/24"),
        ipaddress.ip_network("192.0.2.0/24"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("198.18.0.0/15"),
        ipaddress.ip_network("198.51.100.0/24"),
        ipaddress.ip_network("203.0.113.0/24"),
        ipaddress.ip_network("224.0.0.0/4"),
        ipaddress.ip_network("240.0.0.0/4"),
    )
    _BLOCKED_IPV6_NETWORKS = (
        ipaddress.ip_network("::/128"),
        ipaddress.ip_network("::1/128"),
        ipaddress.ip_network("fc00::/7"),
        ipaddress.ip_network("fe80::/10"),
        ipaddress.ip_network("fec0::/10"),
    )
    _STATUS_LINE_RE = re.compile(r"^HTTP/\d+\.\d+\s+(\d{3})(?:\s+(.*))?$")

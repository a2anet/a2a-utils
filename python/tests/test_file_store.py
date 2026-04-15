"""Tests for FileStore, LocalFileStore, and FilePart handling."""

import base64
import gzip
from pathlib import Path
import socket
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from a2a.types import (
    Artifact,
    DataPart,
    FilePart,
    FileWithBytes,
    FileWithUri,
    Message,
    Part,
    Role,
    TextPart,
)

from a2a_utils.artifacts import minimize_artifacts
from a2a_utils.files import LocalFileStore
from a2a_utils.types import FilePartForLLM

TASK_ID = "11111111-1111-4111-8111-111111111111"
MISSING_TASK_ID = "22222222-2222-4222-8222-222222222222"
ARTIFACT_ID = "33333333-3333-4333-8333-333333333333"
URI_ARTIFACT_ID = "44444444-4444-4444-8444-444444444444"
MISSING_ARTIFACT_ID = "55555555-5555-4555-8555-555555555555"
MESSAGE_ID = "66666666-6666-4666-8666-666666666666"
MISSING_MESSAGE_ID = "77777777-7777-4777-8777-777777777777"


def _make_bytes_artifact(
    artifact_id: str = ARTIFACT_ID,
    name: str = "report.pdf",
    mime_type: str = "application/pdf",
    content: bytes = b"hello world",
) -> Artifact:
    """Create an artifact with a FileWithBytes part."""
    encoded = base64.b64encode(content).decode()
    return Artifact(
        artifact_id=artifact_id,
        parts=[
            Part(
                root=FilePart(
                    file=FileWithBytes(
                        bytes=encoded,
                        name=name,
                        mime_type=mime_type,
                    )
                )
            ),
        ],
    )


def _make_uri_artifact(
    artifact_id: str = URI_ARTIFACT_ID,
    name: str = "image.png",
    mime_type: str = "image/png",
    uri: str = "https://example.com/image.png",
) -> Artifact:
    """Create an artifact with a FileWithUri part."""
    return Artifact(
        artifact_id=artifact_id,
        parts=[
            Part(
                root=FilePart(
                    file=FileWithUri(
                        uri=uri,
                        name=name,
                        mime_type=mime_type,
                    )
                )
            ),
        ],
    )


def _make_bytes_message(
    message_id: str = MESSAGE_ID,
    name: str = "report.pdf",
    mime_type: str = "application/pdf",
    content: bytes = b"hello world",
) -> Message:
    """Create a message with a FileWithBytes part."""
    encoded = base64.b64encode(content).decode()
    return Message(
        message_id=message_id,
        context_id="ctx-1",
        role=Role.agent,
        parts=[
            Part(
                root=FilePart(
                    file=FileWithBytes(
                        bytes=encoded,
                        name=name,
                        mime_type=mime_type,
                    )
                )
            ),
        ],
    )


def _make_uri_message(
    message_id: str = MESSAGE_ID,
    name: str = "message.txt",
    mime_type: str = "text/plain",
    uri: str = "https://example.com/message.txt",
) -> Message:
    """Create a message with a FileWithUri part."""

    return Message(
        message_id=message_id,
        context_id="ctx-1",
        role=Role.agent,
        parts=[
            Part(
                root=FilePart(
                    file=FileWithUri(
                        uri=uri,
                        name=name,
                        mime_type=mime_type,
                    )
                )
            ),
        ],
    )


class TestLocalFileStore:
    @pytest.mark.asyncio
    async def test_save_bytes_artifact(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        content = b"PDF content here"
        artifact = _make_bytes_artifact(content=content)

        paths = await store.save_artifact(TASK_ID, artifact)

        assert len(paths) == 1
        saved_path = Path(paths[0])
        assert saved_path.exists()
        assert saved_path.read_bytes() == content
        assert saved_path.name == "report.pdf"

    @pytest.mark.asyncio
    async def test_save_uri_artifact(self, tmp_path: Path) -> None:
        fetch_file_uri = AsyncMock(return_value=b"image data")
        store = LocalFileStore(tmp_path / "files", fetch_file_uri=fetch_file_uri)
        artifact = _make_uri_artifact()

        paths = await store.save_artifact(TASK_ID, artifact)

        assert len(paths) == 1
        saved_path = Path(paths[0])
        assert saved_path.exists()
        assert saved_path.read_bytes() == b"image data"
        fetch_file_uri.assert_awaited_once_with("https://example.com/image.png")

    @pytest.mark.asyncio
    async def test_get_artifact_paths(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        artifact = _make_bytes_artifact()

        await store.save_artifact(TASK_ID, artifact)
        paths = await store.get_artifact(TASK_ID, ARTIFACT_ID)

        assert len(paths) == 1
        assert "report.pdf" in paths[0]

    @pytest.mark.asyncio
    async def test_get_artifact_nonexistent(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        paths = await store.get_artifact(MISSING_TASK_ID, MISSING_ARTIFACT_ID)
        assert paths == []

    @pytest.mark.asyncio
    async def test_delete_artifact(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        artifact = _make_bytes_artifact()

        await store.save_artifact(TASK_ID, artifact)
        assert (tmp_path / "files" / "artifacts" / TASK_ID / ARTIFACT_ID).exists()

        await store.delete_artifact(TASK_ID, ARTIFACT_ID)
        assert not (tmp_path / "files" / "artifacts" / TASK_ID / ARTIFACT_ID).exists()

    @pytest.mark.asyncio
    async def test_delete_artifact_nonexistent(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        # Should not raise
        await store.delete_artifact(MISSING_TASK_ID, MISSING_ARTIFACT_ID)

    @pytest.mark.asyncio
    async def test_artifact_storage_dir_structure(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        task_id = "88888888-8888-4888-8888-888888888888"
        artifact_id = "99999999-9999-4999-8999-999999999999"
        artifact = _make_bytes_artifact(artifact_id=artifact_id)
        await store.save_artifact(task_id, artifact)

        expected_dir = tmp_path / "files" / "artifacts" / task_id / artifact_id
        assert expected_dir.is_dir()
        assert (expected_dir / "report.pdf").exists()

    @pytest.mark.asyncio
    async def test_no_file_parts_returns_empty(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        artifact = Artifact(
            artifact_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            parts=[Part(root=TextPart(text="hello"))],
        )
        paths = await store.save_artifact(TASK_ID, artifact)
        assert paths == []

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "uri",
        [
            "http://127.0.0.1/secret",
            "http://169.254.169.254/latest/meta-data",
            "https://[::1]/secret",
            "https://[::ffff:7f00:1]/secret",
            "file:///etc/passwd",
            "not a url",
        ],
    )
    async def test_rejects_unsafe_remote_uri(self, tmp_path: Path, uri: str) -> None:
        store = LocalFileStore(tmp_path / "files")

        with pytest.raises(ValueError, match="(Blocked|Disallowed|Invalid)"):
            await store.save_artifact(TASK_ID, _make_uri_artifact(uri=uri, name="bad.txt"))

    @pytest.mark.asyncio
    async def test_default_downloader_rejects_redirects_to_private_targets(
        self, tmp_path: Path
    ) -> None:
        store = LocalFileStore(tmp_path / "files")
        original_resolve_remote_address = store._resolve_remote_address

        async def resolve_remote_address(url: object) -> object:
            hostname = getattr(url, "hostname", None)
            if hostname == "example.com":
                return SimpleNamespace(address="93.184.216.34", family=socket.AF_INET)
            return await original_resolve_remote_address(url)  # type: ignore[arg-type]

        with (
            patch.object(
                store,
                "_resolve_remote_address",
                AsyncMock(side_effect=resolve_remote_address),
            ) as resolve_remote_address,
            patch.object(
                store,
                "_request_remote_url",
                AsyncMock(
                    return_value=SimpleNamespace(
                        status_code=302,
                        reason_phrase="Found",
                        headers={"location": "https://169.254.169.254/latest/meta-data"},
                        body=b"",
                    )
                ),
            ) as request_remote_url,
        ):
            with pytest.raises(ValueError, match="Blocked remote file host"):
                await store.save_artifact(
                    TASK_ID,
                    _make_uri_artifact(uri="https://example.com/start", name="redirect.txt"),
                )

        assert resolve_remote_address.await_count == 2
        request_remote_url.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_default_downloader_decodes_gzip_responses(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        compressed = gzip.compress(b"decoded download")

        with (
            patch.object(
                store,
                "_resolve_remote_address",
                AsyncMock(
                    return_value=SimpleNamespace(address="93.184.216.34", family=socket.AF_INET)
                ),
            ),
            patch.object(
                store,
                "_request_remote_url",
                AsyncMock(
                    return_value=SimpleNamespace(
                        status_code=200,
                        reason_phrase="OK",
                        headers={
                            "content-encoding": "gzip",
                            "content-length": str(len(compressed)),
                        },
                        body=compressed,
                    )
                ),
            ) as request_remote_url,
        ):
            paths = await store.save_artifact(
                TASK_ID,
                _make_uri_artifact(uri="https://example.com/file.txt", name="file.txt"),
            )

        request_remote_url.assert_awaited_once()
        assert Path(paths[0]).read_bytes() == b"decoded download"

    @pytest.mark.asyncio
    async def test_rejects_traversal_ids(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")

        with pytest.raises(ValueError, match="Invalid"):
            await store.save_artifact("../escape", _make_bytes_artifact())
        with pytest.raises(ValueError, match="Invalid"):
            await store.save_artifact(TASK_ID, _make_bytes_artifact(artifact_id="../escape"))
        with pytest.raises(ValueError, match="Invalid"):
            await store.save_message(_make_bytes_message(message_id="../escape"))
        with pytest.raises(ValueError, match="Invalid"):
            await store.save_artifact("task/escape", _make_bytes_artifact())
        with pytest.raises(ValueError, match="Invalid"):
            await store.save_artifact(TASK_ID, _make_bytes_artifact(artifact_id="artifact/escape"))
        with pytest.raises(ValueError, match="Invalid"):
            await store.save_message(_make_bytes_message(message_id="message/escape"))

    @pytest.mark.asyncio
    async def test_accepts_opaque_response_style_ids(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        task_id = "task-1"
        artifact_id = "artifact-1"
        message_id = "resp_04d5f520890c81ff0069deeb2650e08196b2fa18cc08f9f3d9_1"

        artifact_paths = await store.save_artifact(
            task_id,
            _make_bytes_artifact(artifact_id=artifact_id, content=b"artifact"),
        )
        message_paths = await store.save_message(
            _make_bytes_message(message_id=message_id, content=b"message-body")
        )

        assert len(artifact_paths) == 1
        assert len(message_paths) == 1
        assert Path(artifact_paths[0]).read_bytes() == b"artifact"
        assert Path(message_paths[0]).read_bytes() == b"message-body"


class TestLocalFileStoreMessages:
    @pytest.mark.asyncio
    async def test_save_message(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        content = b"PDF content here"
        message = _make_bytes_message(content=content)

        paths = await store.save_message(message)

        assert len(paths) == 1
        saved_path = Path(paths[0])
        assert saved_path.exists()
        assert saved_path.read_bytes() == content
        assert saved_path.name == "report.pdf"

    @pytest.mark.asyncio
    async def test_get_message(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        message = _make_bytes_message()

        await store.save_message(message)
        paths = await store.get_message(MESSAGE_ID)

        assert len(paths) == 1
        assert "report.pdf" in paths[0]

    @pytest.mark.asyncio
    async def test_get_message_nonexistent(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        paths = await store.get_message(MISSING_MESSAGE_ID)
        assert paths == []

    @pytest.mark.asyncio
    async def test_delete_message(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        message = _make_bytes_message()

        await store.save_message(message)
        assert (tmp_path / "files" / "messages" / MESSAGE_ID).exists()

        await store.delete_message(MESSAGE_ID)
        assert not (tmp_path / "files" / "messages" / MESSAGE_ID).exists()

    @pytest.mark.asyncio
    async def test_delete_message_nonexistent(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        # Should not raise
        await store.delete_message(MISSING_MESSAGE_ID)

    @pytest.mark.asyncio
    async def test_message_storage_dir_structure(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        message_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        message = _make_bytes_message(message_id=message_id)
        await store.save_message(message)

        expected_dir = tmp_path / "files" / "messages" / message_id
        assert expected_dir.is_dir()
        assert (expected_dir / "report.pdf").exists()

    @pytest.mark.asyncio
    async def test_save_message_with_uri_uses_injected_downloader(self, tmp_path: Path) -> None:
        fetch_file_uri = AsyncMock(return_value=b"message body")
        store = LocalFileStore(tmp_path / "files", fetch_file_uri=fetch_file_uri)

        paths = await store.save_message(_make_uri_message())

        assert Path(paths[0]).read_bytes() == b"message body"
        fetch_file_uri.assert_awaited_once_with("https://example.com/message.txt")


class TestFilePartHandling:
    def test_minimize_with_saved_file_paths(self) -> None:
        artifact = _make_bytes_artifact()
        result = minimize_artifacts(
            [artifact],
            saved_file_paths={ARTIFACT_ID: ["/storage/task-1/art-1/report.pdf"]},
        )

        assert len(result) == 1
        file_parts = [p for p in result[0].parts if isinstance(p, FilePartForLLM)]
        assert len(file_parts) == 1
        fp = file_parts[0]
        assert fp.kind == "file"
        assert fp.name == "report.pdf"
        assert fp.mime_type == "application/pdf"
        assert fp.bytes == {"_saved_to": ["/storage/task-1/art-1/report.pdf"]}
        assert fp.uri is None

    def test_minimize_bytes_without_file_store(self) -> None:
        artifact = _make_bytes_artifact()
        result = minimize_artifacts([artifact])

        file_parts = [p for p in result[0].parts if isinstance(p, FilePartForLLM)]
        assert len(file_parts) == 1
        fp = file_parts[0]
        assert fp.bytes is not None
        assert "_error" in fp.bytes
        assert fp.uri is None

    def test_minimize_uri_without_file_store(self) -> None:
        artifact = _make_uri_artifact(uri="https://example.com/doc.pdf")
        result = minimize_artifacts([artifact])

        file_parts = [p for p in result[0].parts if isinstance(p, FilePartForLLM)]
        assert len(file_parts) == 1
        fp = file_parts[0]
        assert fp.uri == "https://example.com/doc.pdf"
        assert fp.bytes is None

    def test_minimize_uri_with_saved_file_paths(self) -> None:
        artifact = _make_uri_artifact()
        result = minimize_artifacts(
            [artifact],
            saved_file_paths={URI_ARTIFACT_ID: ["/storage/task-1/art-2/image.png"]},
        )

        file_parts = [p for p in result[0].parts if isinstance(p, FilePartForLLM)]
        assert len(file_parts) == 1
        fp = file_parts[0]
        assert fp.uri == {"_saved_to": ["/storage/task-1/art-2/image.png"]}
        assert fp.bytes is None

    def test_mixed_parts_artifact(self) -> None:
        """Artifact with text, data, and file parts all together."""
        artifact = Artifact(
            artifact_id="art-mix",
            parts=[
                Part(root=TextPart(text="Summary")),
                Part(root=DataPart(data={"key": "value"})),
                Part(
                    root=FilePart(
                        file=FileWithBytes(
                            bytes=base64.b64encode(b"content").decode(),
                            name="file.bin",
                            mime_type="application/octet-stream",
                        )
                    )
                ),
            ],
        )

        result = minimize_artifacts([artifact])
        assert len(result) == 1
        parts = result[0].parts
        # Text part, data part, file part
        assert len(parts) == 3
        assert parts[0].kind == "text"
        assert parts[1].kind == "data"
        assert parts[2].kind == "file"

"""Tests for FileStore, LocalFileStore, and FilePart handling."""

import base64
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

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


def _make_bytes_artifact(
    artifact_id: str = "art-1",
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
    artifact_id: str = "art-2",
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
    message_id: str = "msg-1",
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


class TestLocalFileStore:
    @pytest.mark.asyncio
    async def test_save_bytes_artifact(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        content = b"PDF content here"
        artifact = _make_bytes_artifact(content=content)

        paths = await store.save_artifact("task-1", artifact)

        assert len(paths) == 1
        saved_path = Path(paths[0])
        assert saved_path.exists()
        assert saved_path.read_bytes() == content
        assert saved_path.name == "report.pdf"

    @pytest.mark.asyncio
    async def test_save_uri_artifact(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        artifact = _make_uri_artifact()

        mock_response = MagicMock()
        mock_response.content = b"image data"
        mock_response.raise_for_status = MagicMock()

        with patch.object(store, "_get_httpx_client") as mock_client_fn:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_response
            mock_client_fn.return_value = mock_client

            paths = await store.save_artifact("task-1", artifact)

        assert len(paths) == 1
        saved_path = Path(paths[0])
        assert saved_path.exists()
        assert saved_path.read_bytes() == b"image data"

    @pytest.mark.asyncio
    async def test_get_artifact_paths(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        artifact = _make_bytes_artifact()

        await store.save_artifact("task-1", artifact)
        paths = await store.get_artifact("task-1", "art-1")

        assert len(paths) == 1
        assert "report.pdf" in paths[0]

    @pytest.mark.asyncio
    async def test_get_artifact_nonexistent(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        paths = await store.get_artifact("task-1", "nonexistent")
        assert paths == []

    @pytest.mark.asyncio
    async def test_delete_artifact(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        artifact = _make_bytes_artifact()

        await store.save_artifact("task-1", artifact)
        assert (tmp_path / "files" / "artifacts" / "task-1" / "art-1").exists()

        await store.delete_artifact("task-1", "art-1")
        assert not (tmp_path / "files" / "artifacts" / "task-1" / "art-1").exists()

    @pytest.mark.asyncio
    async def test_delete_artifact_nonexistent(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        # Should not raise
        await store.delete_artifact("task-1", "nonexistent")

    @pytest.mark.asyncio
    async def test_artifact_storage_dir_structure(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        artifact = _make_bytes_artifact(artifact_id="art-abc")
        await store.save_artifact("task-xyz", artifact)

        expected_dir = tmp_path / "files" / "artifacts" / "task-xyz" / "art-abc"
        assert expected_dir.is_dir()
        assert (expected_dir / "report.pdf").exists()

    @pytest.mark.asyncio
    async def test_no_file_parts_returns_empty(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        artifact = Artifact(
            artifact_id="art-text",
            parts=[Part(root=TextPart(text="hello"))],
        )
        paths = await store.save_artifact("task-1", artifact)
        assert paths == []


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
        paths = await store.get_message("msg-1")

        assert len(paths) == 1
        assert "report.pdf" in paths[0]

    @pytest.mark.asyncio
    async def test_get_message_nonexistent(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        paths = await store.get_message("nonexistent")
        assert paths == []

    @pytest.mark.asyncio
    async def test_delete_message(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        message = _make_bytes_message()

        await store.save_message(message)
        assert (tmp_path / "files" / "messages" / "msg-1").exists()

        await store.delete_message("msg-1")
        assert not (tmp_path / "files" / "messages" / "msg-1").exists()

    @pytest.mark.asyncio
    async def test_delete_message_nonexistent(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        # Should not raise
        await store.delete_message("nonexistent")

    @pytest.mark.asyncio
    async def test_message_storage_dir_structure(self, tmp_path: Path) -> None:
        store = LocalFileStore(tmp_path / "files")
        message = _make_bytes_message(message_id="msg-abc")
        await store.save_message(message)

        expected_dir = tmp_path / "files" / "messages" / "msg-abc"
        assert expected_dir.is_dir()
        assert (expected_dir / "report.pdf").exists()


class TestFilePartHandling:
    def test_minimize_with_saved_file_paths(self) -> None:
        artifact = _make_bytes_artifact()
        result = minimize_artifacts(
            [artifact],
            saved_file_paths={"art-1": ["/storage/task-1/art-1/report.pdf"]},
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
            saved_file_paths={"art-2": ["/storage/task-1/art-2/image.png"]},
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

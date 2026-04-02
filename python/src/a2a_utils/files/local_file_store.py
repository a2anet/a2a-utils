"""LocalFileStore — filesystem-backed file storage."""

import asyncio
import base64
from pathlib import Path

import httpx
from a2a.types import Artifact, FilePart, FileWithBytes, FileWithUri, Message, Part

from .file_store import FileStore


class LocalFileStore(FileStore):
    """Store artifact and message files on the local filesystem.

    Artifacts are saved to ``storage_dir/artifacts/task_id/artifact_id/filename``.
    Messages are saved to ``storage_dir/messages/message_id/filename``.
    """

    def __init__(self, storage_dir: Path) -> None:
        self._storage_dir = storage_dir
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._httpx_client: httpx.AsyncClient | None = None

    def _get_httpx_client(self) -> httpx.AsyncClient:
        if self._httpx_client is None:
            self._httpx_client = httpx.AsyncClient()
        return self._httpx_client

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
                file_path = target_dir / name

                if not file_path.resolve().is_relative_to(target_dir.resolve()):
                    raise ValueError(
                        f"Filename '{file_obj.name}' resolves outside storage directory"
                    )

                if isinstance(file_obj, FileWithBytes):
                    data = base64.b64decode(file_obj.bytes)
                    file_path.write_bytes(data)
                elif isinstance(file_obj, FileWithUri):
                    client = self._get_httpx_client()
                    response = await client.get(file_obj.uri)
                    response.raise_for_status()
                    file_path.write_bytes(response.content)

                saved_paths.append(str(file_path))

        return saved_paths

    async def save_artifact(self, task_id: str, artifact: Artifact) -> list[str]:
        """Save file parts from an artifact to disk.

        Returns list of local file paths where files were saved.
        """
        artifact_dir = self._storage_dir / "artifacts" / task_id / artifact.artifact_id
        return await self._save_file_parts(artifact.parts, artifact_dir)

    async def get_artifact(self, task_id: str, artifact_id: str) -> list[str]:
        """Get file paths for a saved artifact.

        Returns list of paths, or empty list if directory does not exist.
        """
        artifact_dir = self._storage_dir / "artifacts" / task_id / artifact_id
        if not artifact_dir.exists():
            return []
        return sorted(str(p) for p in artifact_dir.iterdir() if p.is_file())

    async def delete_artifact(self, task_id: str, artifact_id: str) -> None:
        """Delete saved files for an artifact."""
        artifact_dir = self._storage_dir / "artifacts" / task_id / artifact_id
        if artifact_dir.exists():
            import shutil

            shutil.rmtree(artifact_dir)

    async def save_message(self, message: Message) -> list[str]:
        """Save file parts from a message to disk.

        Returns list of local file paths where files were saved.
        """
        message_dir = self._storage_dir / "messages" / message.message_id
        return await self._save_file_parts(message.parts, message_dir)

    async def get_message(self, message_id: str) -> list[str]:
        """Get file paths for a saved message.

        Returns list of paths, or empty list if directory does not exist.
        """
        message_dir = self._storage_dir / "messages" / message_id
        if not message_dir.exists():
            return []
        return sorted(str(p) for p in message_dir.iterdir() if p.is_file())

    async def delete_message(self, message_id: str) -> None:
        """Delete saved files for a message."""
        message_dir = self._storage_dir / "messages" / message_id
        if message_dir.exists():
            import shutil

            shutil.rmtree(message_dir)

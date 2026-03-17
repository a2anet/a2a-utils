"""LocalFileStore — filesystem-backed file storage."""

import asyncio
import base64
from pathlib import Path

import httpx
from a2a.types import Artifact, FilePart, FileWithBytes, FileWithUri

from .file_store import FileStore


class LocalFileStore(FileStore):
    """Store artifact files on the local filesystem.

    Files are saved to ``storage_dir/task_id/artifact_id/filename``.
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

    async def save(self, task_id: str, artifact: Artifact) -> list[str]:
        """Save file parts from an artifact to disk.

        Returns list of local file paths where files were saved.
        """
        saved_paths: list[str] = []
        artifact_dir = self._storage_dir / task_id / artifact.artifact_id

        for i, part in enumerate(artifact.parts):
            if not isinstance(part.root, FilePart):
                continue

            file_obj = part.root.file
            name = Path(file_obj.name).name if file_obj.name else f"file_{i}"
            name = name.replace("..", "").lstrip(".")
            if not name:
                name = f"file_{i}"

            async with self._lock:
                artifact_dir.mkdir(parents=True, exist_ok=True)
                file_path = artifact_dir / name

                if not file_path.resolve().is_relative_to(artifact_dir.resolve()):
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

    async def get(self, task_id: str, artifact_id: str) -> list[str]:
        """Get file paths for a saved artifact.

        Returns list of paths, or empty list if directory does not exist.
        """
        artifact_dir = self._storage_dir / task_id / artifact_id
        if not artifact_dir.exists():
            return []
        return sorted(str(p) for p in artifact_dir.iterdir() if p.is_file())

    async def delete(self, task_id: str, artifact_id: str) -> None:
        """Delete saved files for an artifact."""
        artifact_dir = self._storage_dir / task_id / artifact_id
        if artifact_dir.exists():
            import shutil

            shutil.rmtree(artifact_dir)

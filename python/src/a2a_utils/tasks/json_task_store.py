"""JSON file-based task store implementing the A2A SDK TaskStore ABC."""

import asyncio
import json
from pathlib import Path

from a2a.server.tasks import TaskStore
from a2a.types import Task
from loguru import logger


class JSONTaskStore(TaskStore):
    """Persists Task objects as individual JSON files.

    Each task is stored at ``{storage_dir}/{task_id}.json`` using
    Pydantic's ``model_dump(mode="json")`` for serialization.
    """

    def __init__(self, storage_dir: Path) -> None:
        self._storage_dir = storage_dir
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()

    async def save(self, task: Task) -> None:  # type: ignore[override]
        """Save a task to disk.

        Args:
            task: The Task object to persist.
        """
        async with self._lock:
            file_path = self._storage_dir / f"{task.id}.json"
            data = task.model_dump(mode="json")
            file_path.write_text(json.dumps(data, indent=2))
            logger.debug(f"Saved task {task.id} to {file_path}")

    async def get(self, task_id: str) -> Task | None:  # type: ignore[override]
        """Load a task from disk.

        Args:
            task_id: The task ID to look up.

        Returns:
            Task if found, None otherwise.
        """
        file_path = self._storage_dir / f"{task_id}.json"
        if not file_path.exists():
            return None

        try:
            data = json.loads(file_path.read_text())
            return Task.model_validate(data)
        except Exception as e:
            logger.error(f"Error loading task {task_id}: {e}")
            return None

    async def delete(self, task_id: str) -> None:  # type: ignore[override]
        """Delete a task from disk.

        Args:
            task_id: The task ID to delete.
        """
        async with self._lock:
            file_path = self._storage_dir / f"{task_id}.json"
            if file_path.exists():
                file_path.unlink()
                logger.debug(f"Deleted task {task_id}")

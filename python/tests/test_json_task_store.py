"""Tests for a2a_utils.json_task_store."""

import json
from pathlib import Path

import pytest

from a2a.types import Task, TaskState, TaskStatus

from a2a_utils.tasks.json_task_store import JSONTaskStore


def _make_task(task_id: str = "task-1", context_id: str = "ctx-1") -> Task:
    """Create a minimal Task object for testing."""

    return Task(
        id=task_id,
        context_id=context_id,
        status=TaskStatus(state=TaskState.completed),
    )


class TestJSONTaskStore:
    @pytest.fixture
    def store(self, tmp_path: Path) -> JSONTaskStore:
        return JSONTaskStore(tmp_path / "tasks")

    @pytest.mark.asyncio
    async def test_save_creates_file(self, store: JSONTaskStore) -> None:
        task = _make_task()
        await store.save(task)
        file_path = store._storage_dir / "task-1.json"
        assert file_path.exists()
        data = json.loads(file_path.read_text())
        assert data["id"] == "task-1"

    @pytest.mark.asyncio
    async def test_get_existing(self, store: JSONTaskStore) -> None:
        task = _make_task()
        await store.save(task)
        loaded = await store.get("task-1")
        assert loaded is not None
        assert loaded.id == "task-1"
        assert loaded.context_id == "ctx-1"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, store: JSONTaskStore) -> None:
        result = await store.get("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete(self, store: JSONTaskStore) -> None:
        task = _make_task()
        await store.save(task)
        await store.delete("task-1")
        assert not (store._storage_dir / "task-1.json").exists()
        assert await store.get("task-1") is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, store: JSONTaskStore) -> None:
        await store.delete("nonexistent")  # Should not raise

    @pytest.mark.asyncio
    async def test_roundtrip_preserves_data(self, store: JSONTaskStore) -> None:
        task = _make_task("rt-task", "rt-ctx")
        await store.save(task)
        loaded = await store.get("rt-task")
        assert loaded is not None
        assert loaded.id == "rt-task"
        assert loaded.context_id == "rt-ctx"
        assert loaded.status.state.value == "completed"

    def test_creates_storage_dir(self, tmp_path: Path) -> None:
        store = JSONTaskStore(tmp_path / "nested" / "tasks")
        assert store._storage_dir.exists()

"""Tests for a2a_utils.json_task_store."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from a2a.types import Task, TaskState, TaskStatus

from a2a_utils.tasks.json_task_store import JSONTaskStore

TASK_ID = "11111111-1111-4111-8111-111111111111"
MISSING_TASK_ID = "22222222-2222-4222-8222-222222222222"


def _make_task(task_id: str = TASK_ID, context_id: str = "ctx-1") -> Task:
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
        file_path = store._storage_dir / f"{TASK_ID}.json"
        assert file_path.exists()
        data = json.loads(file_path.read_text())
        assert data["id"] == TASK_ID

    @pytest.mark.asyncio
    async def test_get_existing(self, store: JSONTaskStore) -> None:
        task = _make_task()
        await store.save(task)
        loaded = await store.get(TASK_ID)
        assert loaded is not None
        assert loaded.id == TASK_ID
        assert loaded.context_id == "ctx-1"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, store: JSONTaskStore) -> None:
        result = await store.get(MISSING_TASK_ID)
        assert result is None

    @pytest.mark.asyncio
    async def test_delete(self, store: JSONTaskStore) -> None:
        task = _make_task()
        await store.save(task)
        await store.delete(TASK_ID)
        assert not (store._storage_dir / f"{TASK_ID}.json").exists()
        assert await store.get(TASK_ID) is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent(self, store: JSONTaskStore) -> None:
        await store.delete(MISSING_TASK_ID)  # Should not raise

    @pytest.mark.asyncio
    async def test_roundtrip_preserves_data(self, store: JSONTaskStore) -> None:
        roundtrip_task_id = "33333333-3333-4333-8333-333333333333"
        task = _make_task(roundtrip_task_id, "rt-ctx")
        await store.save(task)
        loaded = await store.get(roundtrip_task_id)
        assert loaded is not None
        assert loaded.id == roundtrip_task_id
        assert loaded.context_id == "rt-ctx"
        assert loaded.status.state.value == "completed"

    def test_creates_storage_dir(self, tmp_path: Path) -> None:
        store = JSONTaskStore(tmp_path / "nested" / "tasks")
        assert store._storage_dir.exists()

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "task_id",
        [".", "task-1", "../evil", "/tmp/evil", "dir/name", "dir\\name", "task:1"],
    )
    async def test_rejects_unsafe_task_ids(self, store: JSONTaskStore, task_id: str) -> None:
        with pytest.raises(ValueError, match="Invalid"):
            await store.save(_make_task(task_id))
        with pytest.raises(ValueError, match="Invalid"):
            await store.get(task_id)
        with pytest.raises(ValueError, match="Invalid"):
            await store.delete(task_id)

    @pytest.mark.asyncio
    async def test_unsafe_get_does_not_read_outside_storage_root(
        self, store: JSONTaskStore
    ) -> None:
        with patch.object(
            Path, "read_text", side_effect=AssertionError("should not read")
        ) as read_text:
            with pytest.raises(ValueError, match="Invalid"):
                await store.get("../outside")

        read_text.assert_not_called()

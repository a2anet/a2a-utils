"""Tests for a2a_utils.client.a2a_session."""

import base64
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from a2a.server.tasks import InMemoryTaskStore, TaskStore
from a2a.types import (
    FilePart,
    FileWithBytes,
    Message,
    Part,
    Role,
    Task,
    TaskState,
    TaskStatus,
)

from a2a_utils.artifacts import TextArtifacts
from a2a_utils.client.a2a_session import A2ASession
from a2a_utils.client.a2a_agents import A2AAgents
from a2a_utils.tasks.json_task_store import JSONTaskStore

TASK_ID = "11111111-1111-4111-8111-111111111111"
STATUS_MESSAGE_ID = "22222222-2222-4222-8222-222222222222"
HISTORY_MESSAGE_ID = "33333333-3333-4333-8333-333333333333"


class TestA2ASessionInit:
    def test_with_components(self, tmp_path: Path) -> None:
        manager = A2AAgents(None)
        store = JSONTaskStore(tmp_path / "tasks")
        session = A2ASession(
            agents=manager,
            task_store=store,
        )
        assert session.agents is manager
        assert session.task_store is store

    def test_default_task_store_is_in_memory(self) -> None:
        manager = A2AAgents(None)
        session = A2ASession(agents=manager)
        assert isinstance(session.task_store, InMemoryTaskStore)

    def test_custom_task_store(self) -> None:
        manager = A2AAgents(None)
        store = MagicMock(spec=TaskStore)
        session = A2ASession(agents=manager, task_store=store)
        assert session.task_store is store

    def test_file_store_default_none(self) -> None:
        manager = A2AAgents(None)
        session = A2ASession(agents=manager)
        assert session.file_store is None

    def test_default_timeouts(self) -> None:
        manager = A2AAgents(None)
        session = A2ASession(agents=manager)
        assert session._send_message_timeout == 60.0
        assert session._get_task_timeout == 60.0
        assert session._get_task_poll_interval == 5.0

    def test_custom_timeouts(self) -> None:
        manager = A2AAgents(None)
        session = A2ASession(
            agents=manager,
            send_message_timeout=120.0,
            get_task_timeout=30.0,
            get_task_poll_interval=2.0,
        )
        assert session._send_message_timeout == 120.0
        assert session._get_task_timeout == 30.0
        assert session._get_task_poll_interval == 2.0


class TestSendMessageValidation:
    @pytest.mark.asyncio
    async def test_agent_id_not_found(self) -> None:
        manager = A2AAgents(None)
        manager._initialized = True
        session = A2ASession(agents=manager)
        with pytest.raises(ValueError, match="not found"):
            await session.send_message("nonexistent", "hello")

    @pytest.mark.asyncio
    async def test_rejects_non_https_file_urls(self) -> None:
        manager = A2AAgents(None)
        session = A2ASession(agents=manager)
        with pytest.raises(ValueError, match="Disallowed"):
            await session._build_file_part("http://example.com/file.txt")


class TestGetTaskValidation:
    @pytest.mark.asyncio
    async def test_agent_id_not_found(self) -> None:
        manager = A2AAgents(None)
        manager._initialized = True
        session = A2ASession(agents=manager)
        with pytest.raises(ValueError, match="not found"):
            await session.get_task("nonexistent", TASK_ID)

    @pytest.mark.asyncio
    async def test_rejects_unsafe_task_ids_before_network_access(self) -> None:
        manager = A2AAgents(None)
        session = A2ASession(agents=manager)
        with pytest.raises(ValueError, match="Invalid task id"):
            await session.get_task("agent-a", "task/123")


def _make_file_message(message_id: str) -> Message:
    encoded = base64.b64encode(b"file payload").decode()
    return Message(
        message_id=message_id,
        context_id="ctx-1",
        role=Role.agent,
        parts=[
            Part(
                root=FilePart(
                    file=FileWithBytes(
                        bytes=encoded,
                        name="report.pdf",
                        mime_type="application/pdf",
                    )
                )
            )
        ],
    )


class TestSaveTaskFiles:
    @pytest.mark.asyncio
    async def test_saves_status_message_files_without_artifacts(self) -> None:
        manager = A2AAgents(None)
        file_store = MagicMock()
        file_store.get_message = AsyncMock(return_value=[])
        file_store.save_message = AsyncMock(return_value=["/tmp/report.pdf"])
        session = A2ASession(agents=manager, file_store=file_store)

        task = Task(
            id=TASK_ID,
            context_id="ctx-1",
            status=TaskStatus(
                state=TaskState.completed,
                message=_make_file_message(STATUS_MESSAGE_ID),
            ),
            artifacts=[],
            history=None,
        )

        await session._save_task_files(task)

        file_store.get_message.assert_awaited_once_with(STATUS_MESSAGE_ID)
        file_store.save_message.assert_awaited_once_with(task.status.message)

    @pytest.mark.asyncio
    async def test_saves_history_message_files_without_artifacts(self) -> None:
        manager = A2AAgents(None)
        file_store = MagicMock()
        file_store.get_message = AsyncMock(return_value=[])
        file_store.save_message = AsyncMock(return_value=["/tmp/report.pdf"])
        session = A2ASession(agents=manager, file_store=file_store)

        history_message = _make_file_message(HISTORY_MESSAGE_ID)
        task = Task(
            id=TASK_ID,
            context_id="ctx-1",
            status=TaskStatus(state=TaskState.completed, message=None),
            artifacts=[],
            history=[history_message],
        )

        await session._save_task_files(task)

        file_store.get_message.assert_awaited_once_with(HISTORY_MESSAGE_ID)
        file_store.save_message.assert_awaited_once_with(history_message)


class TestTextArtifactsView:
    def test_line_selection(self) -> None:
        text = "line1\nline2\nline3\nline4"
        result = TextArtifacts.view(text, line_start=2, line_end=3)
        assert result == "line2\nline3"

    def test_character_selection(self) -> None:
        text = "Hello, World!"
        result = TextArtifacts.view(text, character_start=0, character_end=5)
        assert result == "Hello"

    def test_character_selection_start_only(self) -> None:
        text = "Hello, World!"
        result = TextArtifacts.view(text, character_start=7)
        assert result == "World!"

    def test_character_selection_end_only(self) -> None:
        text = "Hello, World!"
        result = TextArtifacts.view(text, character_end=5)
        assert result == "Hello"

    def test_mutual_exclusion_line_and_character(self) -> None:
        with pytest.raises(ValueError, match="Cannot use both line and character selection"):
            TextArtifacts.view("hello", line_start=1, character_start=0)

    def test_no_selection_returns_full(self) -> None:
        text = "Hello, World!"
        result = TextArtifacts.view(text)
        assert result == text

    def test_character_limit_exceeded(self) -> None:
        text = "x" * 100
        with pytest.raises(ValueError, match="exceeds"):
            TextArtifacts.view(text, character_limit=50)

"""Tests for a2a_utils.client.a2a_session."""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from a2a.server.tasks import InMemoryTaskStore, TaskStore

from a2a_utils.artifacts import TextArtifacts
from a2a_utils.client.a2a_session import A2ASession
from a2a_utils.client.agent_manager import AgentManager
from a2a_utils.tasks.json_task_store import JSONTaskStore


class TestA2ASessionInit:
    def test_with_components(self, tmp_path: Path) -> None:
        manager = AgentManager(None)
        store = JSONTaskStore(tmp_path / "tasks")
        session = A2ASession(
            agent_manager=manager,
            task_store=store,
        )
        assert session.agent_manager is manager
        assert session.task_store is store

    def test_default_task_store_is_in_memory(self) -> None:
        manager = AgentManager(None)
        session = A2ASession(agent_manager=manager)
        assert isinstance(session.task_store, InMemoryTaskStore)

    def test_custom_task_store(self) -> None:
        manager = AgentManager(None)
        store = MagicMock(spec=TaskStore)
        session = A2ASession(agent_manager=manager, task_store=store)
        assert session.task_store is store

    def test_file_store_default_none(self) -> None:
        manager = AgentManager(None)
        session = A2ASession(agent_manager=manager)
        assert session.file_store is None

    def test_default_timeouts(self) -> None:
        manager = AgentManager(None)
        session = A2ASession(agent_manager=manager)
        assert session._send_message_timeout == 60.0
        assert session._get_task_timeout == 60.0
        assert session._get_task_poll_interval == 5.0

    def test_custom_timeouts(self) -> None:
        manager = AgentManager(None)
        session = A2ASession(
            agent_manager=manager,
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
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)
        with pytest.raises(ValueError, match="not found"):
            await session.send_message("nonexistent", "hello")


class TestGetTaskValidation:
    @pytest.mark.asyncio
    async def test_agent_id_not_found(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)
        with pytest.raises(ValueError, match="not found"):
            await session.get_task("nonexistent", "task-123")


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

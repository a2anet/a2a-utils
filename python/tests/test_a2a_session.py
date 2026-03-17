"""Tests for a2a_utils.client.a2a_session."""

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from a2a.server.tasks import InMemoryTaskStore, TaskStore
from a2a.types import TextPart, DataPart

from a2a_utils.artifacts import TextArtifacts
from a2a_utils.client.a2a_session import A2ASession
from a2a_utils.client.agent_manager import AgentManager
from a2a_utils.tasks.json_task_store import JSONTaskStore
from a2a_utils.types import ArtifactSettings, ArtifactForLLM, TextPartForLLM, DataPartForLLM


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

    def test_default_artifact_settings(self) -> None:
        manager = AgentManager(None)
        session = A2ASession(agent_manager=manager)
        assert session._artifact_settings.send_message_character_limit == 50_000
        assert session._artifact_settings.minimized_object_string_length == 5_000
        assert session._artifact_settings.view_artifact_character_limit == 50_000

    def test_custom_artifact_settings(self) -> None:
        manager = AgentManager(None)
        settings = ArtifactSettings(
            send_message_character_limit=100_000,
            minimized_object_string_length=10_000,
            view_artifact_character_limit=75_000,
        )
        session = A2ASession(agent_manager=manager, artifact_settings=settings)
        assert session._artifact_settings.send_message_character_limit == 100_000
        assert session._artifact_settings.minimized_object_string_length == 10_000
        assert session._artifact_settings.view_artifact_character_limit == 75_000

    def test_file_store_default_none(self) -> None:
        manager = AgentManager(None)
        session = A2ASession(agent_manager=manager)
        assert session._file_store is None


class TestSendMessageValidation:
    @pytest.mark.asyncio
    async def test_agent_id_not_found(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)
        with pytest.raises(ValueError, match="not found"):
            await session.send_message("nonexistent", "hello")


class TestGetArtifact:
    @pytest.mark.asyncio
    async def test_from_task_store(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)

        artifact = MagicMock()
        artifact.artifact_id = "art-1"

        task = MagicMock()
        task.id = "task-1"
        task.artifacts = [artifact]

        await session.task_store.save(task)

        result_artifact = await session._get_artifact("agent-a", "task-1", "art-1")
        assert result_artifact is artifact

    @pytest.mark.asyncio
    async def test_not_found(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)
        with pytest.raises(ValueError, match="not found"):
            await session._get_artifact("agent-a", "task-1", "nonexistent")

    @pytest.mark.asyncio
    async def test_explicit_agent_id(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)
        with pytest.raises(ValueError):
            await session._get_artifact("agent-a", "task-1", "art-1")


class TestViewTextArtifact:
    @pytest.mark.asyncio
    async def test_view_text_extracts_and_wraps(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)

        # Create a mock artifact with TextPart content
        text_part = MagicMock()
        text_part.root = TextPart(text="line1\nline2\nline3")
        artifact = MagicMock()
        artifact.artifact_id = "art-1"
        artifact.description = "test desc"
        artifact.name = "test.txt"
        artifact.parts = [text_part]

        task = MagicMock()
        task.id = "task-1"
        task.artifacts = [artifact]

        await session.task_store.save(task)

        result = await session.view_text_artifact(
            "agent-a", "task-1", "art-1", line_start=1, line_end=2
        )
        assert isinstance(result, ArtifactForLLM)
        assert result.artifact_id == "art-1"
        assert result.description == "test desc"
        assert result.name == "test.txt"
        assert len(result.parts) == 1
        assert isinstance(result.parts[0], TextPartForLLM)
        assert result.parts[0].text == "line1\nline2"

    @pytest.mark.asyncio
    async def test_view_text_with_character_selection(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)

        text_part = MagicMock()
        text_part.root = TextPart(text="Hello, World!")
        artifact = MagicMock()
        artifact.artifact_id = "art-1"
        artifact.description = None
        artifact.name = "test.txt"
        artifact.parts = [text_part]

        task = MagicMock()
        task.id = "task-1"
        task.artifacts = [artifact]

        await session.task_store.save(task)

        result = await session.view_text_artifact(
            "agent-a", "task-1", "art-1", character_start=0, character_end=5
        )
        part = result.parts[0]
        assert isinstance(part, TextPartForLLM)
        assert part.text == "Hello"

    @pytest.mark.asyncio
    async def test_view_text_no_text_content(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)

        data_part = MagicMock()
        data_part.root = DataPart(data={"key": "value"})
        artifact = MagicMock()
        artifact.artifact_id = "art-1"
        artifact.description = None
        artifact.name = "test"
        artifact.parts = [data_part]

        task = MagicMock()
        task.id = "task-1"
        task.artifacts = [artifact]

        await session.task_store.save(task)

        with pytest.raises(ValueError, match="does not contain text"):
            await session.view_text_artifact("agent-a", "task-1", "art-1")


class TestViewDataArtifact:
    @pytest.mark.asyncio
    async def test_view_data_extracts_and_wraps(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)

        data_part = MagicMock()
        data_part.root = DataPart(
            data={
                "employees": [
                    {"name": "Alice", "age": 30},
                    {"name": "Bob", "age": 25},
                ]
            }
        )
        artifact = MagicMock()
        artifact.artifact_id = "art-1"
        artifact.description = "people"
        artifact.name = "employees"
        artifact.parts = [data_part]

        task = MagicMock()
        task.id = "task-1"
        task.artifacts = [artifact]

        await session.task_store.save(task)

        result = await session.view_data_artifact(
            "agent-a",
            "task-1",
            "art-1",
            json_path="employees",
            rows=0,
            columns="name",
        )
        assert isinstance(result, ArtifactForLLM)
        assert result.artifact_id == "art-1"
        assert result.description == "people"
        assert result.name == "employees"
        assert len(result.parts) == 1
        assert isinstance(result.parts[0], DataPartForLLM)
        assert result.parts[0].data == [{"name": "Alice"}]

    @pytest.mark.asyncio
    async def test_view_data_no_data_content(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        session = A2ASession(agent_manager=manager)

        text_part = MagicMock()
        text_part.root = TextPart(text="hello")
        artifact = MagicMock()
        artifact.artifact_id = "art-1"
        artifact.description = None
        artifact.name = "test"
        artifact.parts = [text_part]

        task = MagicMock()
        task.id = "task-1"
        task.artifacts = [artifact]

        await session.task_store.save(task)

        with pytest.raises(ValueError, match="does not contain data"):
            await session.view_data_artifact("agent-a", "task-1", "art-1")


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

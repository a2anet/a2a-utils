"""Tests for a2a_utils.client.a2a_tools."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from a2a.types import (
    DataPart,
    Message,
    Part,
    Role,
    Task,
    TaskState,
    TaskStatus,
    TextPart,
)

from a2a_utils.client.a2a_session import A2ASession
from a2a_utils.client.a2a_agents import A2AAgents
from a2a_utils.client.a2a_tools import A2ATools
from a2a_utils.types import ArtifactSettings


@pytest.fixture
def agents() -> A2AAgents:
    manager = A2AAgents(None)
    manager._initialized = True
    return manager


@pytest.fixture
def session(agents: A2AAgents) -> A2ASession:
    return A2ASession(agents=agents)


@pytest.fixture
def tools(session: A2ASession) -> A2ATools:
    return A2ATools(session)


class TestA2AToolsInit:
    def test_default_artifact_settings(self, session: A2ASession) -> None:
        tools = A2ATools(session)
        assert tools._artifact_settings.send_message_character_limit == 50_000
        assert tools._artifact_settings.minimized_object_string_length == 5_000
        assert tools._artifact_settings.view_artifact_character_limit == 50_000

    def test_custom_artifact_settings(self, session: A2ASession) -> None:
        settings = ArtifactSettings(
            send_message_character_limit=100_000,
            minimized_object_string_length=10_000,
            view_artifact_character_limit=75_000,
        )
        tools = A2ATools(session, artifact_settings=settings)
        assert tools._artifact_settings.send_message_character_limit == 100_000
        assert tools._artifact_settings.minimized_object_string_length == 10_000
        assert tools._artifact_settings.view_artifact_character_limit == 75_000

    def test_session_reference(self, session: A2ASession) -> None:
        tools = A2ATools(session)
        assert tools._session is session


class TestGetAgents:
    async def test_returns_dict(self, tools: A2ATools) -> None:
        with patch.object(
            tools._session.agents, "get_agents_for_llm", new_callable=AsyncMock
        ) as mock:
            mock.return_value = {
                "agent-a": {"name": "Agent A", "description": "Does A things"},
            }
            result = await tools.get_agents()

        assert "agent-a" in result
        assert result["agent-a"]["name"] == "Agent A"

    async def test_empty_with_init_errors(self, tools: A2ATools) -> None:
        with patch.object(
            tools._session.agents, "get_agents_for_llm", new_callable=AsyncMock
        ) as mock:
            mock.return_value = {}
            tools._session.agents._init_errors = {
                "bad-agent": "ConnectionError: refused"
            }
            result = await tools.get_agents()

        assert result["agents"] == {}
        assert "bad-agent" in result["errors"]
        assert "Failed to load agent" in result["errors"]["bad-agent"]

    async def test_error_returns_dict_with_error(self, tools: A2ATools) -> None:
        with patch.object(
            tools._session.agents, "get_agents_for_llm", new_callable=AsyncMock
        ) as mock:
            mock.side_effect = RuntimeError("boom")
            result = await tools.get_agents()

        assert result["error"] is True
        assert "boom" in result["error_message"]


class TestGetAgent:
    async def test_returns_agent_details(self, tools: A2ATools) -> None:
        with patch.object(
            tools._session.agents, "get_agent_for_llm", new_callable=AsyncMock
        ) as mock:
            mock.return_value = {
                "name": "Agent A",
                "description": "Does A things",
                "skills": [{"name": "search", "description": "Search the web"}],
            }
            result = await tools.get_agent("agent-a")

        assert result["name"] == "Agent A"
        assert len(result["skills"]) == 1

    async def test_not_found_returns_actionable_error(self, tools: A2ATools) -> None:
        with patch.object(
            tools._session.agents, "get_agent_for_llm", new_callable=AsyncMock
        ) as mock_for_llm:
            mock_for_llm.return_value = None
            with patch.object(
                tools._session.agents, "get_agents", new_callable=AsyncMock
            ) as mock_get:
                mock_get.return_value = {"agent-b": MagicMock()}
                result = await tools.get_agent("nonexistent")

        assert result["error"] is True
        assert "not found" in result["error_message"]
        assert "get_agents" in result["error_message"]
        assert "agent-b" in result["error_message"]

    async def test_error_returns_dict_with_error(self, tools: A2ATools) -> None:
        with patch.object(
            tools._session.agents, "get_agent_for_llm", new_callable=AsyncMock
        ) as mock:
            mock.side_effect = RuntimeError("kaboom")
            result = await tools.get_agent("agent-a")

        assert result["error"] is True
        assert "kaboom" in result["error_message"]


class TestSendMessage:
    async def test_returns_serialized_task(self, tools: A2ATools) -> None:
        task = Task(
            id="task-1",
            context_id="ctx-1",
            status=TaskStatus(state=TaskState.completed),
            artifacts=[],
        )
        with patch.object(tools._session, "send_message", new_callable=AsyncMock) as mock:
            mock.return_value = task
            result = await tools.send_message("agent-a", "hello")

        assert result["id"] == "task-1"
        assert result["kind"] == "task"
        assert result["status"]["state"] == "completed"

    async def test_returns_serialized_message(self, tools: A2ATools) -> None:
        msg = Message(
            context_id="ctx-1",
            message_id="msg-1",
            parts=[Part(root=TextPart(text="Hi there"))],
            role=Role.agent,
        )
        with patch.object(tools._session, "send_message", new_callable=AsyncMock) as mock:
            mock.return_value = msg
            result = await tools.send_message("agent-a", "hello")

        assert result["kind"] == "message"
        assert result["parts"][0]["text"] == "Hi there"

    async def test_agent_not_found_error(self, tools: A2ATools) -> None:
        with patch.object(tools._session, "send_message", new_callable=AsyncMock) as mock:
            mock.side_effect = ValueError("Agent 'bad' not found. Available agents: agent-a")
            result = await tools.send_message("bad", "hello")

        assert result["error"] is True
        assert "not found" in result["error_message"]
        assert "get_agents" in result["error_message"]

    async def test_timeout_error(self, tools: A2ATools) -> None:
        with patch.object(tools._session, "send_message", new_callable=AsyncMock) as mock:
            mock.side_effect = TimeoutError()
            result = await tools.send_message("agent-a", "hello")

        assert result["error"] is True
        assert "timed out" in result["error_message"]

    async def test_generic_error(self, tools: A2ATools) -> None:
        with patch.object(tools._session, "send_message", new_callable=AsyncMock) as mock:
            mock.side_effect = RuntimeError("network error")
            result = await tools.send_message("agent-a", "hello")

        assert result["error"] is True
        assert "network error" in result["error_message"]


class TestGetTask:
    async def test_returns_serialized_task(self, tools: A2ATools) -> None:
        task = Task(
            id="task-1",
            context_id="ctx-1",
            status=TaskStatus(state=TaskState.working),
            artifacts=[],
        )
        with patch.object(tools._session, "get_task", new_callable=AsyncMock) as mock:
            mock.return_value = task
            result = await tools.get_task("agent-a", "task-1")

        assert result["id"] == "task-1"
        assert result["status"]["state"] == "working"

    async def test_agent_not_found_error(self, tools: A2ATools) -> None:
        with patch.object(tools._session, "get_task", new_callable=AsyncMock) as mock:
            mock.side_effect = ValueError("Agent 'bad' not found")
            result = await tools.get_task("bad", "task-1")

        assert result["error"] is True
        assert "not found" in result["error_message"]
        assert "get_agents" in result["error_message"]

    async def test_timeout_error(self, tools: A2ATools) -> None:
        with patch.object(tools._session, "get_task", new_callable=AsyncMock) as mock:
            mock.side_effect = TimeoutError()
            result = await tools.get_task("agent-a", "task-1")

        assert result["error"] is True
        assert "timed out" in result["error_message"]


class TestViewTextArtifact:
    async def test_returns_serialized_artifact(self, tools: A2ATools) -> None:
        artifact = MagicMock()
        artifact.artifact_id = "art-1"
        artifact.description = "A document"
        artifact.name = "doc.txt"
        text_part = MagicMock()
        text_part.root = TextPart(text="line1\nline2")
        artifact.parts = [text_part]

        with patch.object(tools, "_get_artifact", new_callable=AsyncMock) as mock:
            mock.return_value = artifact
            result = await tools.view_text_artifact("agent-a", "task-1", "art-1")

        assert result["artifact_id"] == "art-1"
        assert result["parts"][0]["text"] == "line1\nline2"

    async def test_artifact_not_found_error(self, tools: A2ATools) -> None:
        with patch.object(tools, "_get_artifact", new_callable=AsyncMock) as mock:
            mock.side_effect = ValueError("Artifact 'art-x' not found in task 'task-1'")
            result = await tools.view_text_artifact("agent-a", "task-1", "art-x")

        assert result["error"] is True
        assert "art-x" in result["error_message"]
        assert "task-1" in result["error_message"]

    async def test_no_text_content_error(self, tools: A2ATools) -> None:
        artifact = MagicMock()
        artifact.artifact_id = "art-1"
        data_part = MagicMock()
        data_part.root = DataPart(data={"key": "value"})
        artifact.parts = [data_part]

        with patch.object(tools, "_get_artifact", new_callable=AsyncMock) as mock:
            mock.return_value = artifact
            result = await tools.view_text_artifact("agent-a", "task-1", "art-1")

        assert result["error"] is True
        assert "does not contain text" in result["error_message"]


class TestViewDataArtifact:
    async def test_returns_serialized_artifact(self, tools: A2ATools) -> None:
        artifact = MagicMock()
        artifact.artifact_id = "art-1"
        artifact.description = "data"
        artifact.name = "results"
        data_part = MagicMock()
        data_part.root = DataPart(data={"key": "value"})
        artifact.parts = [data_part]

        with patch.object(tools, "_get_artifact", new_callable=AsyncMock) as mock:
            mock.return_value = artifact
            result = await tools.view_data_artifact("agent-a", "task-1", "art-1")

        assert result["artifact_id"] == "art-1"
        assert result["parts"][0]["data"] == {"key": "value"}

    async def test_with_rows_and_columns(self, tools: A2ATools) -> None:
        artifact = MagicMock()
        artifact.artifact_id = "art-1"
        artifact.description = None
        artifact.name = None
        data_part = MagicMock()
        data_part.root = DataPart(
            data={
                "employees": [
                    {"name": "Alice", "age": 30},
                    {"name": "Bob", "age": 25},
                ]
            }
        )
        artifact.parts = [data_part]

        with patch.object(tools, "_get_artifact", new_callable=AsyncMock) as mock:
            mock.return_value = artifact
            result = await tools.view_data_artifact(
                "agent-a", "task-1", "art-1",
                json_path="employees",
                rows="0",
                columns="name",
            )

        assert result["parts"][0]["data"] == [{"name": "Alice"}]

    async def test_artifact_not_found_error(self, tools: A2ATools) -> None:
        with patch.object(tools, "_get_artifact", new_callable=AsyncMock) as mock:
            mock.side_effect = ValueError("Artifact 'art-x' not found in task 'task-1'")
            result = await tools.view_data_artifact("agent-a", "task-1", "art-x")

        assert result["error"] is True
        assert "art-x" in result["error_message"]


class TestParseRows:
    def test_none(self) -> None:
        assert A2ATools._parse_rows(None) is None

    def test_all(self) -> None:
        assert A2ATools._parse_rows("all") == "all"

    def test_single_int(self) -> None:
        assert A2ATools._parse_rows("0") == 0
        assert A2ATools._parse_rows("5") == 5

    def test_range(self) -> None:
        assert A2ATools._parse_rows("0-10") == "0-10"

    def test_comma_separated(self) -> None:
        assert A2ATools._parse_rows("0,2,5") == [0, 2, 5]

    def test_comma_separated_with_spaces(self) -> None:
        assert A2ATools._parse_rows("0, 2, 5") == [0, 2, 5]

    def test_whitespace_stripped(self) -> None:
        assert A2ATools._parse_rows("  3  ") == 3

    def test_invalid_comma_separated(self) -> None:
        with pytest.raises(ValueError, match="integers"):
            A2ATools._parse_rows("a,b,c")

    def test_invalid_string(self) -> None:
        with pytest.raises(ValueError, match="Invalid rows format"):
            A2ATools._parse_rows("abc")


class TestParseColumns:
    def test_none(self) -> None:
        assert A2ATools._parse_columns(None) is None

    def test_all(self) -> None:
        assert A2ATools._parse_columns("all") == "all"

    def test_single_column(self) -> None:
        assert A2ATools._parse_columns("name") == "name"

    def test_comma_separated(self) -> None:
        assert A2ATools._parse_columns("name,age") == ["name", "age"]

    def test_comma_separated_with_spaces(self) -> None:
        assert A2ATools._parse_columns("name, age, email") == ["name", "age", "email"]

    def test_whitespace_stripped(self) -> None:
        assert A2ATools._parse_columns("  name  ") == "name"

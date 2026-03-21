"""Ready-made agent tools for A2A communication."""

import dataclasses
from enum import Enum
from typing import Any

from a2a.types import (
    Artifact,
    DataPart,
    Message,
    Task,
    TextPart,
)

from ..artifacts import DataArtifacts, TextArtifacts, minimize_artifacts
from ..types import (
    ArtifactForLLM,
    ArtifactSettings,
    DataPartForLLM,
    FilePartForLLM,
    MessageForLLM,
    TaskForLLM,
    TaskStatusForLLM,
    TextPartForLLM,
)
from .a2a_session import A2ASession

TEXT_MINIMIZED_TIP = "Text was minimized. Call view_text_artifact() to view specific line ranges."
DATA_MINIMIZED_TIP = "Data was minimized. Call view_data_artifact() to navigate to specific data."


class A2ATools:
    """LLM-friendly tools that can be used out-of-the-box with agent frameworks.

    Each method has LLM-friendly docstrings, returns JSON-serialisable objects, and returns actionable error messages."""

    def __init__(
        self,
        session: A2ASession,
        *,
        artifact_settings: ArtifactSettings | None = None,
    ) -> None:
        self._session = session
        self._artifact_settings = artifact_settings or ArtifactSettings()

    async def get_agents(self) -> dict[str, Any]:
        """List all available agents with their names and descriptions.

        Use this first to discover what agents are available before sending messages.
        Each agent has a unique ID (the key) that you'll need for other tools like
        send_message and get_agent.

        Returns a dict mapping agent IDs to their name and description.
        If any agents failed to load, an "errors" field is included with details.
        """
        try:
            result = await self._session.agent_manager.get_agents_for_llm(detail="basic")
            init_errors = self._session.agent_manager.initialization_errors
            if not result and init_errors:
                return {
                    "agents": result,
                    "errors": {
                        agent_id: f"Failed to load agent: {error}"
                        for agent_id, error in init_errors.items()
                    },
                }
            return result
        except Exception as e:
            return {"error": True, "error_message": f"Failed to list agents: {e}"}

    async def get_agent(self, agent_id: str) -> dict[str, Any]:
        """Get detailed information about a specific agent, including its skills.

        Use this after get_agents to learn more about what a specific agent can do.
        The response includes the agent's name, description, and a list of skills
        with their descriptions.

        Args:
            agent_id: The agent's unique identifier (from get_agents).
        """
        try:
            result = await self._session.agent_manager.get_agent_for_llm(agent_id, detail="full")
            if result is None:
                available = sorted(await self._session.agent_manager.get_agents())
                return {
                    "error": True,
                    "error_message": (
                        f"Agent '{agent_id}' not found. "
                        f"Use get_agents to see available agents. "
                        f"Available: {', '.join(available) if available else '(none)'}"
                    ),
                }
            return result
        except Exception as e:
            return {"error": True, "error_message": f"Failed to get agent info: {e}"}

    async def send_message(
        self,
        agent_id: str,
        message: str,
        context_id: str | None = None,
        task_id: str | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        """Send a message to an agent and receive a structured response.

        This is the primary way to communicate with agents. The response includes
        the agent's reply and any generated artifacts.

        Artifact data in responses may be minimized for display. Fields prefixed
        with "_" indicate metadata about minimized content. Use view_text_artifact
        or view_data_artifact to access full artifact data.

        If the task is still in progress after the timeout, the response includes
        a task_id. Use get_task with that task_id to continue monitoring.

        Args:
            agent_id: ID of the agent to message (from get_agents).
            message: The message content to send.
            context_id: Continue an existing conversation by providing its context ID.
                Omit to start a new conversation.
            task_id: Attach to an existing task (for input_required flows).
            timeout: Override the default timeout in seconds.
        """
        try:
            result = await self._session.send_message(
                agent_id,
                message,
                context_id=context_id,
                task_id=task_id,
                timeout=timeout,
            )
            llm_result: TaskForLLM | MessageForLLM
            if isinstance(result, Task):
                llm_result = await self._build_task_for_llm(result)
            else:
                llm_result = await self._build_message_for_llm(result)
            return self._serialize_for_json(llm_result)
        except ValueError as e:
            error_msg = str(e)
            if "not found" in error_msg.lower():
                return {
                    "error": True,
                    "error_message": (f"{error_msg} Use get_agents to see available agents."),
                }
            return {"error": True, "error_message": error_msg}
        except TimeoutError:
            return {
                "error": True,
                "error_message": (
                    "Request timed out. You can retry with a longer timeout, "
                    "or if a task_id was returned earlier, use get_task to check progress."
                ),
            }
        except Exception as e:
            return {"error": True, "error_message": f"Failed to send message: {e}"}

    async def get_task(
        self,
        agent_id: str,
        task_id: str,
        timeout: float | None = None,
        poll_interval: float | None = None,
    ) -> dict[str, Any]:
        """Check the progress of a task that is still in progress.

        Use this after send_message returns a task in a non-terminal state
        (e.g. "working") to monitor its progress.

        If the task is still running after the timeout, the current state is
        returned. Call get_task again to continue monitoring.

        Args:
            agent_id: ID of the agent that owns the task.
            task_id: Task ID from a previous send_message response.
            timeout: Override the monitoring timeout in seconds.
            poll_interval: Override the interval between status checks in seconds.
        """
        try:
            result = await self._session.get_task(
                agent_id,
                task_id,
                timeout=timeout,
                poll_interval=poll_interval,
            )
            llm_result = await self._build_task_for_llm(result)
            return self._serialize_for_json(llm_result)
        except ValueError as e:
            error_msg = str(e)
            if "not found" in error_msg.lower():
                return {
                    "error": True,
                    "error_message": (f"{error_msg} Use get_agents to see available agents."),
                }
            return {"error": True, "error_message": error_msg}
        except TimeoutError:
            return {
                "error": True,
                "error_message": (
                    "Request timed out. You can retry with a longer timeout, "
                    "or use get_task again to continue monitoring."
                ),
            }
        except Exception as e:
            return {"error": True, "error_message": f"Failed to get task: {e}"}

    async def view_text_artifact(
        self,
        agent_id: str,
        task_id: str,
        artifact_id: str,
        line_start: int | None = None,
        line_end: int | None = None,
        character_start: int | None = None,
        character_end: int | None = None,
    ) -> dict[str, Any]:
        """View text content from an artifact, optionally selecting a range.

        Use this for artifacts containing text (documents, logs, code, etc.).
        You can select by line range OR character range, but not both.

        Args:
            agent_id: ID of the agent that produced the artifact.
            task_id: Task ID containing the artifact.
            artifact_id: The artifact's unique identifier (from the task's artifacts list).
            line_start: Starting line number (1-based, inclusive).
            line_end: Ending line number (1-based, inclusive).
            character_start: Starting character index (0-based, inclusive).
            character_end: Ending character index (0-based, exclusive).
        """
        try:
            artifact = await self._get_artifact(agent_id, task_id, artifact_id)
            text = self._extract_text(artifact)
            filtered = TextArtifacts.view(
                text,
                line_start=line_start,
                line_end=line_end,
                character_start=character_start,
                character_end=character_end,
                character_limit=self._artifact_settings.view_artifact_character_limit,
            )
            result = ArtifactForLLM(
                artifact_id=artifact.artifact_id,
                description=artifact.description,
                name=artifact.name,
                parts=[TextPartForLLM(kind="text", text=filtered)],
            )
            return self._serialize_for_json(result)
        except ValueError as e:
            error_msg = str(e)
            if "not found" in error_msg.lower():
                if "artifact" in error_msg.lower():
                    return {
                        "error": True,
                        "error_message": (
                            f"Artifact '{artifact_id}' not found in task '{task_id}'. "
                            "Check the task's artifacts list for valid artifact IDs."
                        ),
                    }
                return {
                    "error": True,
                    "error_message": (f"{error_msg} Use get_agents to see available agents."),
                }
            return {"error": True, "error_message": error_msg}
        except Exception as e:
            return {"error": True, "error_message": f"Failed to view text artifact: {e}"}

    async def view_data_artifact(
        self,
        agent_id: str,
        task_id: str,
        artifact_id: str,
        json_path: str | None = None,
        rows: str | None = None,
        columns: str | None = None,
    ) -> dict[str, Any]:
        """View structured data from an artifact with optional filtering.

        Use this for artifacts containing JSON data (objects, arrays, tables).
        You can navigate to specific data with json_path, then filter with
        rows and columns for tabular data.

        Args:
            agent_id: ID of the agent that produced the artifact.
            task_id: Task ID containing the artifact.
            artifact_id: The artifact's unique identifier (from the task's artifacts list).
            json_path: Dot-separated path to navigate into the data (e.g. "results.items").
            rows: Row selection for list data. Examples: "0" (single row), "0-10" (range),
                "0,2,5" (specific rows), "all" (every row).
            columns: Column selection for tabular data (list of objects). Examples:
                "name" (single column), "name,age" (multiple columns), "all" (every column).
        """
        try:
            parsed_rows = self._parse_rows(rows)
            parsed_columns = self._parse_columns(columns)

            artifact = await self._get_artifact(agent_id, task_id, artifact_id)
            data = self._extract_data(artifact)
            filtered = DataArtifacts.view(
                data,
                json_path=json_path,
                rows=parsed_rows,
                columns=parsed_columns,
                character_limit=self._artifact_settings.view_artifact_character_limit,
            )
            result = ArtifactForLLM(
                artifact_id=artifact.artifact_id,
                description=artifact.description,
                name=artifact.name,
                parts=[DataPartForLLM(kind="data", data=filtered)],
            )
            return self._serialize_for_json(result)
        except ValueError as e:
            error_msg = str(e)
            if "not found" in error_msg.lower():
                if "artifact" in error_msg.lower():
                    return {
                        "error": True,
                        "error_message": (
                            f"Artifact '{artifact_id}' not found in task '{task_id}'. "
                            "Check the task's artifacts list for valid artifact IDs."
                        ),
                    }
                return {
                    "error": True,
                    "error_message": (f"{error_msg} Use get_agents to see available agents."),
                }
            return {"error": True, "error_message": error_msg}
        except Exception as e:
            return {"error": True, "error_message": f"Failed to view data artifact: {e}"}

    # -- LLM conversion methods --
    async def _build_message_for_llm(self, message: Message) -> MessageForLLM:
        """Convert an A2A Message to MessageForLLM.

        Combines all TextParts into a single TextPartForLLM.
        FileParts are ignored; file handling is done at the artifact level.
        """
        parts: list[TextPartForLLM | DataPartForLLM | FilePartForLLM] = []

        # Combine all text parts
        text_segments: list[str] = []
        for part in message.parts:
            if isinstance(part.root, TextPart):
                text_segments.append(part.root.text)

        if text_segments:
            parts.append(TextPartForLLM(kind="text", text="".join(text_segments)))

        # Each data part stays separate
        for part in message.parts:
            if isinstance(part.root, DataPart):
                parts.append(DataPartForLLM(kind="data", data=part.root.data))

        return MessageForLLM(
            context_id=message.context_id,
            kind="message",
            parts=parts,
        )

    async def _build_task_for_llm(self, task: Task) -> TaskForLLM:
        """Convert a Task to TaskForLLM with artifact minimization and file path queries."""
        # Query file_store for saved file paths
        saved_file_paths: dict[str, list[str]] | None = None
        if self._session.file_store is not None and task.artifacts:
            saved_file_paths = {}
            for artifact in task.artifacts:
                paths = await self._session.file_store.get(task.id, artifact.artifact_id)
                if paths:
                    saved_file_paths[artifact.artifact_id] = paths

        minimized = (
            minimize_artifacts(
                task.artifacts,
                character_limit=self._artifact_settings.send_message_character_limit,
                minimized_object_string_length=self._artifact_settings.minimized_object_string_length,
                saved_file_paths=saved_file_paths,
                text_tip=TEXT_MINIMIZED_TIP,
                data_tip=DATA_MINIMIZED_TIP,
            )
            if task.artifacts
            else []
        )

        # Build status message
        status_message: MessageForLLM | None = None
        if task.status.message:
            status_message = await self._build_message_for_llm(task.status.message)

        return TaskForLLM(
            id=task.id,
            context_id=task.context_id,
            kind="task",
            status=TaskStatusForLLM(
                state=task.status.state,
                message=status_message,
            ),
            artifacts=minimized,
        )

    async def _get_artifact(
        self,
        agent_id: str,
        task_id: str,
        artifact_id: str,
    ) -> Artifact:
        """Look up an artifact through the resolution chain.

        1. Check the task store (local cache)
        2. Fetch fresh via session.get_task (remote retrieval)

        Returns:
            The Artifact.

        Raises:
            ValueError: If artifact cannot be found.
        """
        # 1. Check task store (local cache)
        task = await self._session.task_store.get(task_id)
        if task is not None and task.artifacts:
            for artifact in task.artifacts:
                if artifact.artifact_id == artifact_id:
                    return artifact

        # 2. Fetch fresh via session.get_task
        task = await self._session.get_task(agent_id, task_id)
        if task.artifacts:
            for artifact in task.artifacts:
                if artifact.artifact_id == artifact_id:
                    return artifact

        raise ValueError(
            f"Artifact '{artifact_id}' not found in task '{task_id}'. "
            "The artifact may have expired or the task_id may be incorrect."
        )

    @staticmethod
    def _serialize_for_json(obj: Any) -> Any:
        """Recursively convert frozen dataclasses and enums to JSON-safe values."""
        if isinstance(obj, Enum):
            return obj.value
        if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
            return {k: A2ATools._serialize_for_json(v) for k, v in dataclasses.asdict(obj).items()}
        if isinstance(obj, dict):
            return {k: A2ATools._serialize_for_json(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [A2ATools._serialize_for_json(item) for item in obj]
        return obj

    @staticmethod
    def _extract_text(artifact: Artifact) -> str:
        """Extract text content from artifact parts.

        Raises:
            ValueError: If artifact does not contain text content.
        """
        text_parts = []
        for part in artifact.parts:
            if isinstance(part.root, TextPart):
                text_parts.append(part.root.text)
        if not text_parts:
            part_types = {type(p.root).__name__ for p in artifact.parts}
            raise ValueError(
                f"Artifact '{artifact.artifact_id}' does not contain text content. "
                f"Found part types: {', '.join(sorted(part_types))}"
            )
        return "\n".join(text_parts)

    @staticmethod
    def _extract_data(artifact: Artifact) -> Any:
        """Extract data content from artifact parts.

        Raises:
            ValueError: If artifact does not contain data content.
        """
        data_parts = []
        for part in artifact.parts:
            if isinstance(part.root, DataPart):
                data_parts.append(part.root.data)
        if not data_parts:
            part_types = {type(p.root).__name__ for p in artifact.parts}
            raise ValueError(
                f"Artifact '{artifact.artifact_id}' does not contain data content. "
                f"Found part types: {', '.join(sorted(part_types))}"
            )
        return data_parts[0] if len(data_parts) == 1 else data_parts

    @staticmethod
    def _parse_rows(rows: str | None) -> int | list[int] | str | None:
        """Parse a rows string into the type expected by DataArtifacts.view.

        Accepts: "0" (single int), "0-10" (range string), "0,2,5" (comma-separated
        list of ints), "all" (passthrough string), or None.
        """
        if rows is None:
            return None

        rows = rows.strip()

        if rows == "all":
            return "all"

        # Comma-separated list: "0,2,5"
        if "," in rows:
            try:
                return [int(x.strip()) for x in rows.split(",")]
            except ValueError:
                raise ValueError(
                    f"Invalid rows format: '{rows}'. "
                    "Comma-separated values must be integers. "
                    "Examples: '0', '0-10', '0,2,5', 'all'."
                )

        # Range string: "0-10"
        if "-" in rows:
            return rows

        # Single integer: "0"
        try:
            return int(rows)
        except ValueError:
            raise ValueError(
                f"Invalid rows format: '{rows}'. "
                "Examples: '0' (single row), '0-10' (range), '0,2,5' (specific rows), 'all'."
            )

    @staticmethod
    def _parse_columns(columns: str | None) -> str | list[str] | None:
        """Parse a columns string into the type expected by DataArtifacts.view.

        Accepts: "name" (single column), "name,age" (comma-separated list),
        "all" (passthrough string), or None.
        """
        if columns is None:
            return None

        columns = columns.strip()

        if columns == "all":
            return "all"

        # Comma-separated list: "name,age"
        if "," in columns:
            return [c.strip() for c in columns.split(",")]

        # Single column name
        return columns

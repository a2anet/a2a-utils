"""A2ASession — main interface for interacting with A2A agents."""

import uuid
from typing import Any, Union

import httpx
from a2a.client import A2AClient
from a2a.client.errors import A2AClientJSONRPCError
from a2a.server.tasks import InMemoryTaskStore, TaskStore
from a2a.types import (
    Artifact,
    AgentCard,
    DataPart,
    FilePart,
    GetTaskRequest,
    GetTaskSuccessResponse,
    JSONRPCErrorResponse,
    Message,
    MessageSendParams,
    Part,
    Role,
    SendMessageRequest,
    SendMessageSuccessResponse,
    Task,
    TaskQueryParams,
    TextPart,
)
from loguru import logger

from .agent_manager import AgentManager
from ..artifacts import minimize_artifacts, TextArtifacts, DataArtifacts
from ..files import FileStore
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

TEXT_MINIMIZED_TIP = "Text was minimized. Call view_text_artifact() to view specific line ranges."
DATA_MINIMIZED_TIP = "Data was minimized. Call view_data_artifact() to navigate to specific data."


class A2ASession:
    """Main interface for sending messages to A2A agents and viewing artifacts."""

    def __init__(
        self,
        agent_manager: AgentManager,
        *,
        task_store: TaskStore | None = None,
        file_store: FileStore | None = None,
        artifact_settings: ArtifactSettings | None = None,
    ) -> None:
        self.agent_manager = agent_manager
        self.task_store: TaskStore = task_store or InMemoryTaskStore()
        self._file_store = file_store
        self._artifact_settings = artifact_settings or ArtifactSettings()

    async def send_message(
        self,
        agent_id: str,
        message: str,
        *,
        context_id: str | None = None,
        task_id: str | None = None,
    ) -> TaskForLLM | MessageForLLM:
        """Send a message to an A2A agent.

        Args:
            agent_id: Registered agent identifier.
            message: The message content to send.
            context_id: Optional context ID to continue a conversation.
                Auto-generated when None.
            task_id: Optional task ID to attach to the message.

        Returns:
            TaskForLLM for task responses, MessageForLLM for message-only responses.

        Raises:
            ValueError: If agent is not found.
            A2AClientJSONRPCError: On JSON-RPC error from the agent.
        """
        agent_card, headers = await self._resolve_agent(agent_id)

        if context_id is None:
            context_id = str(uuid.uuid4())

        # Build A2A message
        a2a_message = Message(
            context_id=context_id,
            message_id=str(uuid.uuid4()),
            parts=[Part(root=TextPart(text=message))],
            role=Role.user,
        )

        if task_id is not None:
            a2a_message.task_id = task_id

        send_request = SendMessageRequest(
            id=str(uuid.uuid4()),
            params=MessageSendParams(message=a2a_message),
        )

        http_kwargs: dict[str, Any] = {}
        if headers:
            http_kwargs["headers"] = headers

        async with httpx.AsyncClient() as httpx_client:
            client = A2AClient(httpx_client=httpx_client, agent_card=agent_card)
            response = await client.send_message(
                request=send_request,
                http_kwargs=http_kwargs if http_kwargs else None,
            )

        actual_response = response.root if hasattr(response, "root") else response

        if isinstance(actual_response, JSONRPCErrorResponse):
            raise A2AClientJSONRPCError(actual_response)

        if not isinstance(actual_response, SendMessageSuccessResponse):
            raise ValueError(f"Unexpected response type: {type(actual_response).__name__}")

        result = actual_response.result

        # Handle Message result
        if isinstance(result, Message):
            return await self._build_message_for_llm(result)

        # Handle Task result
        if not isinstance(result, Task):
            raise ValueError(f"Expected Task or Message response, got {type(result).__name__}")

        task = result
        await self.task_store.save(task)

        # Save files if file_store is configured
        saved_file_paths: dict[str, list[str]] | None = None
        if self._file_store is not None and task.artifacts:
            saved_file_paths = {}
            for artifact in task.artifacts:
                has_files = any(isinstance(p.root, FilePart) for p in artifact.parts)
                if has_files:
                    paths = await self._file_store.save(task.id, artifact)
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
            context_id=context_id,
            kind="task",
            status=TaskStatusForLLM(
                state=task.status.state,
                message=status_message,
            ),
            artifacts=minimized,
        )

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

    async def view_text_artifact(
        self,
        agent_id: str,
        task_id: str,
        artifact_id: str,
        *,
        line_start: int | None = None,
        line_end: int | None = None,
        character_start: int | None = None,
        character_end: int | None = None,
    ) -> ArtifactForLLM:
        """View text content from an artifact with optional line or character range.

        Args:
            agent_id: Agent ID for remote artifact retrieval.
            task_id: The task containing the artifact.
            artifact_id: The artifact identifier.
            line_start: Starting line number (1-based, inclusive).
            line_end: Ending line number (1-based, inclusive).
            character_start: Starting character index (0-based, inclusive).
            character_end: Ending character index (0-based, exclusive).

        Returns:
            ArtifactForLLM with text content in parts.

        Raises:
            ValueError: If artifact is not found or does not contain text.
        """
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
        return ArtifactForLLM(
            artifact_id=artifact.artifact_id,
            description=artifact.description,
            name=artifact.name,
            parts=[TextPartForLLM(kind="text", text=filtered)],
        )

    async def view_data_artifact(
        self,
        agent_id: str,
        task_id: str,
        artifact_id: str,
        *,
        json_path: str | None = None,
        rows: Union[int, list[int], str, None] = None,
        columns: Union[str, list[str], None] = None,
    ) -> ArtifactForLLM:
        """View structured data from an artifact with optional filtering.

        Args:
            agent_id: Agent ID for remote artifact retrieval.
            task_id: The task containing the artifact.
            artifact_id: The artifact identifier.
            json_path: Dot-separated path to extract specific fields.
            rows: Row selection.
            columns: Column selection.

        Returns:
            ArtifactForLLM with data content in parts.

        Raises:
            ValueError: If artifact is not found or does not contain data.
        """
        artifact = await self._get_artifact(agent_id, task_id, artifact_id)
        data = self._extract_data(artifact)
        filtered = DataArtifacts.view(
            data,
            json_path=json_path,
            rows=rows,
            columns=columns,
            character_limit=self._artifact_settings.view_artifact_character_limit,
        )
        return ArtifactForLLM(
            artifact_id=artifact.artifact_id,
            description=artifact.description,
            name=artifact.name,
            parts=[DataPartForLLM(kind="data", data=filtered)],
        )

    # -- Private helpers --

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

    async def _resolve_agent(self, agent_id: str) -> tuple[AgentCard, dict[str, str]]:
        """Resolve agent card and headers.

        Returns:
            Tuple of (AgentCard, headers_dict).

        Raises:
            ValueError: If agent cannot be resolved.
        """
        agent = await self.agent_manager.get_agent(agent_id)
        if agent is None:
            available = ", ".join(sorted(await self.agent_manager.get_agents()))
            raise ValueError(f"Agent '{agent_id}' not found. Available agents: {available}")
        return agent.agent_card, agent.custom_headers

    async def _get_artifact(
        self,
        agent_id: str,
        task_id: str,
        artifact_id: str,
    ) -> Artifact:
        """Look up an artifact through the resolution chain.

        1. Remote retrieval via A2AClient (freshest data)
        2. Fall back to task_store

        Returns:
            The Artifact.

        Raises:
            ValueError: If artifact cannot be found.
        """
        # 1. Remote retrieval (freshest data)
        agent = await self.agent_manager.get_agent(agent_id)
        if agent is not None:
            try:
                async with httpx.AsyncClient() as httpx_client:
                    client = A2AClient(
                        httpx_client=httpx_client,
                        agent_card=agent.agent_card,
                    )
                    get_request = GetTaskRequest(
                        id=str(uuid.uuid4()),
                        params=TaskQueryParams(id=task_id),
                    )
                    response = await client.get_task(request=get_request)
                    actual = response.root if hasattr(response, "root") else response
                    if isinstance(actual, GetTaskSuccessResponse):
                        result = actual.result
                        if isinstance(result, Task):
                            await self.task_store.save(result)
                            if result.artifacts:
                                for artifact in result.artifacts:
                                    if artifact.artifact_id == artifact_id:
                                        return artifact
            except Exception as e:
                logger.debug(f"Remote artifact retrieval failed: {e}")

        # 2. Fall back to task store
        task = await self.task_store.get(task_id)
        if task is not None and task.artifacts:
            for artifact in task.artifacts:
                if artifact.artifact_id == artifact_id:
                    return artifact

        raise ValueError(
            f"Artifact '{artifact_id}' not found in task '{task_id}'. "
            "The artifact may have expired or the task_id may be incorrect."
        )

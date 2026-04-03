"""A2ASession — main interface for interacting with A2A agents."""

import asyncio
import base64
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from a2a.client import A2AClient
from a2a.client.errors import A2AClientJSONRPCError
from a2a.server.tasks import InMemoryTaskStore, TaskStore
from a2a.types import (
    AgentCard,
    DataPart,
    FilePart,
    FileWithBytes,
    FileWithUri,
    GetTaskRequest,
    GetTaskSuccessResponse,
    JSONRPCErrorResponse,
    Message,
    MessageSendConfiguration,
    MessageSendParams,
    Part,
    Role,
    SendMessageRequest,
    SendMessageSuccessResponse,
    SendStreamingMessageSuccessResponse,
    Task,
    TaskIdParams,
    TaskQueryParams,
    TaskResubscriptionRequest,
    TaskStatusUpdateEvent,
    TextPart,
)
from loguru import logger

from ..files import FileStore
from ..types import JsonObject, TERMINAL_OR_ACTIONABLE_STATES
from .a2a_agents import A2AAgents


class A2ASession:
    """Main interface for sending messages to A2A agents."""

    _MAX_FILE_SIZE = 1_048_576  # 1MB

    _MIME_TYPES: dict[str, str] = {
        ".txt": "text/plain",
        ".html": "text/html",
        ".htm": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".xml": "application/xml",
        ".csv": "text/csv",
        ".md": "text/markdown",
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".zip": "application/zip",
        ".gz": "application/gzip",
        ".tar": "application/x-tar",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".ppt": "application/vnd.ms-powerpoint",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".yaml": "application/x-yaml",
        ".yml": "application/x-yaml",
        ".wasm": "application/wasm",
    }

    def __init__(
        self,
        agents: A2AAgents,
        *,
        task_store: TaskStore | None = None,
        file_store: FileStore | None = None,
        send_message_timeout: float = 60.0,
        get_task_timeout: float = 60.0,
        get_task_poll_interval: float = 5.0,
    ) -> None:
        self.agents = agents
        self.task_store: TaskStore = task_store or InMemoryTaskStore()
        self.file_store: FileStore | None = file_store
        self._send_message_timeout = send_message_timeout
        self._get_task_timeout = get_task_timeout
        self._get_task_poll_interval = get_task_poll_interval

    async def send_message(
        self,
        agent_id: str,
        message: str,
        *,
        context_id: str | None = None,
        task_id: str | None = None,
        timeout: float | None = None,
        data: list[JsonObject] | None = None,
        files: list[str] | None = None,
    ) -> Task | Message:
        """Send a message to an A2A agent.

        Args:
            agent_id: Registered agent identifier.
            message: The message content to send.
            context_id: Optional context ID to continue a conversation.
                Auto-generated when None.
            task_id: Optional task ID to attach to the message.
            timeout: HTTP timeout in seconds. Defaults to ``send_message_timeout``
                from ``__init__``.
            data: Structured data to include with the message. Each item
                is sent as a separate JSON object alongside the text.
            files: Files to include with the message. Accepts local file paths
                (read and sent as binary, max 1MB) or URLs (sent as references
                for the remote agent to fetch).

        Returns:
            Task for task responses, Message for message-only responses.

        Raises:
            ValueError: If agent is not found.
            A2AClientJSONRPCError: On JSON-RPC error from the agent.
        """
        agent_card, headers = await self._resolve_agent(agent_id)

        if context_id is None:
            context_id = str(uuid.uuid4())

        # Build A2A message parts
        parts: list[Part] = [Part(root=TextPart(text=message))]

        # Add data parts
        if data:
            for d in data:
                parts.append(Part(root=DataPart(data=d)))

        # Add file parts
        if files:
            for file_ref in files:
                parts.append(Part(root=await self._build_file_part(file_ref)))

        a2a_message = Message(
            context_id=context_id,
            message_id=str(uuid.uuid4()),
            parts=parts,
            role=Role.user,
        )

        if task_id is not None:
            a2a_message.task_id = task_id

        send_request = SendMessageRequest(
            id=str(uuid.uuid4()),
            params=MessageSendParams(
                message=a2a_message,
                configuration=MessageSendConfiguration(blocking=False),
            ),
        )

        http_kwargs: dict[str, Any] = {}
        if headers:
            http_kwargs["headers"] = headers

        effective_timeout = timeout if timeout is not None else self._send_message_timeout
        start = time.monotonic()
        async with httpx.AsyncClient(timeout=httpx.Timeout(effective_timeout)) as httpx_client:
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
            await self._save_message_files(result)
            return result

        # Handle Task result
        if not isinstance(result, Task):
            raise ValueError(f"Expected Task or Message response, got {type(result).__name__}")

        task = result
        await self.task_store.save(task)

        # If task is already in a terminal/actionable state, save files and return
        if task.status.state in TERMINAL_OR_ACTIONABLE_STATES:
            await self._save_task_files(task)
            return task

        # Task is in a non-terminal state (e.g. working) — monitor with remaining time
        elapsed = time.monotonic() - start
        remaining = max(0, effective_timeout - elapsed)
        if remaining > 0:
            supports_streaming = (
                agent_card.capabilities is not None and agent_card.capabilities.streaming
            )
            if supports_streaming:
                task = await self._get_task_streaming(agent_card, headers, task.id, remaining)
            else:
                task = await self._get_task_polling(
                    agent_card, headers, task.id, remaining, self._get_task_poll_interval
                )
            await self.task_store.save(task)

        await self._save_task_files(task)
        return task

    async def get_task(
        self,
        agent_id: str,
        task_id: str,
        *,
        timeout: float | None = None,
        poll_interval: float | None = None,
    ) -> Task:
        """Get the current state of a task, monitoring until terminal/actionable state.

        If the remote agent supports streaming, uses SSE resubscription for real-time
        updates. Otherwise, polls at regular intervals.

        On monitoring timeout, returns the current task state (which may still be
        non-terminal, e.g. ``working``). The only errors from ``get_task`` are failed
        HTTP requests (agent down, network error).

        Args:
            agent_id: Registered agent identifier.
            task_id: Task ID from a previous ``send_message`` call.
            timeout: Total monitoring timeout in seconds. Defaults to
                ``get_task_timeout`` from ``__init__``.
            poll_interval: Interval between polls in seconds (used when streaming
                is not supported). Defaults to ``get_task_poll_interval`` from
                ``__init__``.

        Returns:
            Task with the current task state. If monitoring times out, the
            returned task may still be in a non-terminal state.

        Raises:
            ValueError: If agent is not found.
        """
        agent_card, headers = await self._resolve_agent(agent_id)
        effective_timeout = timeout if timeout is not None else self._get_task_timeout
        effective_poll_interval = (
            poll_interval if poll_interval is not None else self._get_task_poll_interval
        )

        supports_streaming = (
            agent_card.capabilities is not None and agent_card.capabilities.streaming
        )

        if supports_streaming:
            task = await self._get_task_streaming(agent_card, headers, task_id, effective_timeout)
        else:
            task = await self._get_task_polling(
                agent_card, headers, task_id, effective_timeout, effective_poll_interval
            )

        await self.task_store.save(task)
        await self._save_task_files(task)
        return task

    async def _build_file_part(self, file_ref: str) -> FilePart:
        """Build a FilePart from a file path or URL."""
        if file_ref.startswith("http://") or file_ref.startswith("https://"):
            return FilePart(file=FileWithUri(uri=file_ref))

        file_path = Path(file_ref)
        content = file_path.read_bytes()
        if len(content) > A2ASession._MAX_FILE_SIZE:
            size_mb = len(content) / A2ASession._MAX_FILE_SIZE
            raise ValueError(
                f"File '{file_ref}' is {size_mb:.1f}MB. Maximum size for file uploads is 1MB."
            )
        name = file_path.name
        mime_type = A2ASession._get_mime_type(name)
        encoded = base64.b64encode(content).decode()
        return FilePart(file=FileWithBytes(name=name, mime_type=mime_type, bytes=encoded))

    @staticmethod
    def _get_mime_type(filename: str) -> str:
        """Return a MIME type for the given filename based on its extension."""
        ext = Path(filename).suffix.lower()
        return A2ASession._MIME_TYPES.get(ext, "application/octet-stream")

    async def _save_task_files(self, task: Task) -> None:
        """Save file artifacts to the file store if configured.

        Idempotent: skips artifacts whose files have already been saved.
        """
        if self.file_store is None:
            return

        if task.artifacts:
            for artifact in task.artifacts:
                has_files = any(isinstance(p.root, FilePart) for p in artifact.parts)
                if has_files:
                    existing = await self.file_store.get_artifact(task.id, artifact.artifact_id)
                    if not existing:
                        await self.file_store.save_artifact(task.id, artifact)

        # Also save files from the status message
        if task.status.message:
            await self._save_message_files(task.status.message)

        # Save files from history messages
        if task.history:
            for message in task.history:
                await self._save_message_files(message)

    async def _save_message_files(self, message: Message) -> None:
        """Save file parts from a message to the file store if configured.

        Idempotent: skips messages whose files have already been saved.
        """
        if self.file_store is None:
            return
        has_files = any(isinstance(p.root, FilePart) for p in message.parts)
        if has_files:
            existing = await self.file_store.get_message(message.message_id)
            if not existing:
                await self.file_store.save_message(message)

    async def _get_task_streaming(
        self,
        agent_card: AgentCard,
        headers: dict[str, str],
        task_id: str,
        timeout: float,
    ) -> Task:
        """Monitor a task via SSE resubscription, falling back to a final fetch."""
        http_kwargs: dict[str, Any] = {}
        if headers:
            http_kwargs["headers"] = headers

        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as httpx_client:
            client = A2AClient(httpx_client=httpx_client, agent_card=agent_card)

            resubscribe_request = TaskResubscriptionRequest(
                id=str(uuid.uuid4()),
                params=TaskIdParams(id=task_id),
            )

            try:
                async with asyncio.timeout(timeout):
                    async for sse_response in client.resubscribe(
                        request=resubscribe_request,
                        http_kwargs=http_kwargs if http_kwargs else None,
                    ):
                        actual = (
                            sse_response.root if hasattr(sse_response, "root") else sse_response
                        )
                        if not isinstance(actual, SendStreamingMessageSuccessResponse):
                            continue

                        result = actual.result
                        if isinstance(result, TaskStatusUpdateEvent):
                            if result.status.state in TERMINAL_OR_ACTIONABLE_STATES:
                                break
                        elif isinstance(result, Task):
                            if result.status.state in TERMINAL_OR_ACTIONABLE_STATES:
                                break
            except TimeoutError:
                logger.info(f"Task {task_id} still in working state after {timeout}s")

            # Final fetch to get the complete Task with all artifacts
            return await self._fetch_task(client, task_id, http_kwargs)

    async def _get_task_polling(
        self,
        agent_card: AgentCard,
        headers: dict[str, str],
        task_id: str,
        timeout: float,
        poll_interval: float,
    ) -> Task:
        """Monitor a task by polling at regular intervals."""
        http_kwargs: dict[str, Any] = {}
        if headers:
            http_kwargs["headers"] = headers

        start = time.monotonic()
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(self._send_message_timeout)
        ) as httpx_client:
            client = A2AClient(httpx_client=httpx_client, agent_card=agent_card)

            while True:
                task = await self._fetch_task(client, task_id, http_kwargs)
                if task.status.state in TERMINAL_OR_ACTIONABLE_STATES:
                    return task
                elapsed = time.monotonic() - start
                if elapsed >= timeout:
                    logger.info(f"Task {task_id} still in working state after {timeout}s")
                    return task
                await asyncio.sleep(poll_interval)

    async def _fetch_task(
        self,
        client: A2AClient,
        task_id: str,
        http_kwargs: dict[str, Any],
    ) -> Task:
        """Fetch a task via A2AClient.get_task()."""
        get_request = GetTaskRequest(
            id=str(uuid.uuid4()),
            params=TaskQueryParams(id=task_id),
        )
        response = await client.get_task(
            request=get_request,
            http_kwargs=http_kwargs if http_kwargs else None,
        )
        actual = response.root if hasattr(response, "root") else response

        if isinstance(actual, JSONRPCErrorResponse):
            raise A2AClientJSONRPCError(actual)

        if not isinstance(actual, GetTaskSuccessResponse):
            raise ValueError(f"Unexpected response type: {type(actual).__name__}")

        result = actual.result
        if not isinstance(result, Task):
            raise ValueError(f"Expected Task response, got {type(result).__name__}")

        return result

    async def _resolve_agent(self, agent_id: str) -> tuple[AgentCard, dict[str, str]]:
        """Resolve agent card and headers.

        Returns:
            Tuple of (AgentCard, headers_dict).

        Raises:
            ValueError: If agent cannot be resolved.
        """
        agent = await self.agents.get_agent(agent_id)
        if agent is None:
            available = ", ".join(sorted(await self.agents.get_agents()))
            raise ValueError(f"Agent '{agent_id}' not found. Available agents: {available}")
        return agent.agent_card, agent.custom_headers

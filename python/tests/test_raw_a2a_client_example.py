"""Example test for the raw A2A SDK client flow."""

import asyncio
import sys
from typing import ClassVar
from uuid import uuid4

import httpx
import pytest
from a2a.client import A2AClient, A2ACardResolver
from a2a.types import (
    AgentCapabilities,
    AgentCard,
    AgentSkill,
    GetTaskRequest,
    GetTaskResponse,
    GetTaskSuccessResponse,
    JSONRPCErrorResponse,
    Message,
    MessageSendConfiguration,
    MessageSendParams,
    Part,
    Role,
    SendMessageRequest,
    SendMessageResponse,
    SendMessageSuccessResponse,
    Task,
    TaskQueryParams,
    TaskState,
    TaskStatus,
    TextPart,
)

TERMINAL_OR_ACTIONABLE_STATES = {
    TaskState.completed,
    TaskState.failed,
    TaskState.canceled,
    TaskState.rejected,
    TaskState.input_required,
    TaskState.auth_required,
}


def get_result_or_raise_error(response: SendMessageResponse | GetTaskResponse) -> Task | Message:
    response_root = response.root

    if isinstance(response_root, JSONRPCErrorResponse):
        raise RuntimeError(f"JSON-RPC error: {response_root.error.message}")

    if not isinstance(response_root, (SendMessageSuccessResponse, GetTaskSuccessResponse)):
        raise TypeError(f"Unexpected response type: {type(response_root).__name__}")

    return response_root.result


async def raw_a2a_client_example() -> Task | Message:
    async with httpx.AsyncClient() as httpx_client:
        # 1. Resolve the Agent Card
        resolver = A2ACardResolver(
            httpx_client=httpx_client,
            base_url="https://research.example.com",
        )
        agent_card = await resolver.get_agent_card(
            http_kwargs={"headers": {"X-API-Key": "key_123"}}
        )

        # 2. Build the Message
        send_request = SendMessageRequest(
            id=str(uuid4()),
            params=MessageSendParams(
                message=Message(
                    message_id=str(uuid4()),
                    parts=[
                        Part(root=TextPart(text="Find recent papers on quantum computing")),
                    ],
                    role=Role.user,
                ),
                configuration=MessageSendConfiguration(blocking=False),
            ),
        )

        # 3. Send the Message (non-blocking)
        client = A2AClient(httpx_client=httpx_client, agent_card=agent_card)
        response = await client.send_message(
            request=send_request,
            http_kwargs={"headers": {"X-API-Key": "key_123"}},
        )

        task_or_message = get_result_or_raise_error(response)
        if isinstance(task_or_message, Message):
            return task_or_message

        task = task_or_message
        # 4. Poll until the Task reaches a terminal state
        while task.status.state not in TERMINAL_OR_ACTIONABLE_STATES:
            await asyncio.sleep(0)
            task_response = await client.get_task(
                request=GetTaskRequest(
                    id=str(uuid4()),
                    params=TaskQueryParams(id=task.id),
                ),
                http_kwargs={"headers": {"X-API-Key": "key_123"}},
            )
            result = get_result_or_raise_error(task_response)
            if not isinstance(result, Task):
                raise TypeError(f"Expected Task response, got {type(result).__name__}")
            task = result

        return task


def _agent_card() -> AgentCard:
    return AgentCard(
        name="Research Bot",
        description="Find and summarize research papers",
        url="https://research.example.com",
        version="1.0.0",
        capabilities=AgentCapabilities(),
        default_input_modes=["text/plain"],
        default_output_modes=["text/plain"],
        skills=[
            AgentSkill(
                id="research",
                name="Research",
                description="Find recent papers",
                tags=["research"],
            ),
        ],
    )


def _task(state: TaskState) -> Task:
    return Task(
        id="task-1",
        context_id="ctx-1",
        status=TaskStatus(state=state),
        artifacts=[],
    )


class FakeA2ACardResolver:
    def __init__(
        self,
        httpx_client: httpx.AsyncClient,
        base_url: str,
    ) -> None:
        self.httpx_client = httpx_client
        self.base_url = base_url

    async def get_agent_card(self, http_kwargs: dict[str, object] | None = None) -> AgentCard:
        assert self.base_url == "https://research.example.com"
        assert http_kwargs == {"headers": {"X-API-Key": "key_123"}}
        return _agent_card()


class FakeA2AClient:
    get_task_calls: ClassVar[int] = 0

    def __init__(
        self,
        httpx_client: httpx.AsyncClient,
        agent_card: AgentCard,
    ) -> None:
        self.httpx_client = httpx_client
        self.agent_card = agent_card

    async def send_message(
        self,
        request: SendMessageRequest,
        *,
        http_kwargs: dict[str, object] | None = None,
    ) -> SendMessageResponse:
        assert http_kwargs == {"headers": {"X-API-Key": "key_123"}}
        assert request.params.configuration is not None
        assert request.params.configuration.blocking is False
        text_part = request.params.message.parts[0].root
        assert isinstance(text_part, TextPart)
        assert text_part.text == "Find recent papers on quantum computing"
        return SendMessageResponse(
            root=SendMessageSuccessResponse(id=request.id, result=_task(TaskState.working))
        )

    async def get_task(
        self,
        request: GetTaskRequest,
        *,
        http_kwargs: dict[str, object] | None = None,
    ) -> GetTaskResponse:
        FakeA2AClient.get_task_calls += 1
        assert http_kwargs == {"headers": {"X-API-Key": "key_123"}}
        assert request.params.id == "task-1"
        return GetTaskResponse(
            root=GetTaskSuccessResponse(id=request.id, result=_task(TaskState.completed))
        )


async def test_raw_a2a_client_example_polls_until_completed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(sys.modules[__name__], "A2ACardResolver", FakeA2ACardResolver)
    monkeypatch.setattr(sys.modules[__name__], "A2AClient", FakeA2AClient)
    FakeA2AClient.get_task_calls = 0

    result = await raw_a2a_client_example()

    assert isinstance(result, Task)
    assert result.status.state is TaskState.completed
    assert FakeA2AClient.get_task_calls == 1

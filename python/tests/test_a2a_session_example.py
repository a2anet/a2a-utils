"""Example test for A2ASession."""

import pytest
from a2a.types import Message, Task, TaskState, TaskStatus

from a2a_utils import (
    A2AAgents,
    A2ASession,
    TERMINAL_OR_ACTIONABLE_STATES,
)


async def a2a_session_example() -> Task | Message:
    a2a_agents = A2AAgents(
        {
            "research-bot": {
                "url": "https://research.example.com/.well-known/agent-card.json",
                "custom_headers": {"X-API-Key": "key_123"},
            },
        }
    )

    session = A2ASession(agents=a2a_agents)

    response = await session.send_message("research-bot", "Find recent papers on quantum computing")

    if isinstance(response, Message):
        return response

    while response.status.state not in TERMINAL_OR_ACTIONABLE_STATES:
        response = await session.get_task("research-bot", response.id)

    return response


def _task(state: TaskState) -> Task:
    return Task(
        id="task-1",
        context_id="ctx-1",
        status=TaskStatus(state=state),
        artifacts=[],
    )


async def test_a2a_session_example_polls_until_completed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    get_task_calls = 0

    async def send_message(
        self: A2ASession,
        agent_id: str,
        message: str,
    ) -> Task:
        assert isinstance(self.agents, A2AAgents)
        assert agent_id == "research-bot"
        assert message == "Find recent papers on quantum computing"
        return _task(TaskState.working)

    async def get_task(self: A2ASession, agent_id: str, task_id: str) -> Task:
        nonlocal get_task_calls
        assert isinstance(self.agents, A2AAgents)
        assert agent_id == "research-bot"
        assert task_id == "task-1"
        get_task_calls += 1
        return _task(TaskState.completed)

    monkeypatch.setattr(A2ASession, "send_message", send_message)
    monkeypatch.setattr(A2ASession, "get_task", get_task)

    result = await a2a_session_example()

    assert isinstance(result, Task)
    assert result.status.state is TaskState.completed
    assert get_task_calls == 1

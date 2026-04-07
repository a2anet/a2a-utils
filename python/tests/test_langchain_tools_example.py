"""Example test for Python LangChain tools."""

from pathlib import Path

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from a2a_utils import (
    A2AAgents,
    A2ASession,
    A2ATools,
    JSONTaskStore,
    LocalFileStore,
)


def langchain_tools_example(tmp_path: Path) -> dict[str, object]:
    a2a_agents = A2AAgents(
        {
            "weather": {"url": "https://weather.example.com/.well-known/agent-card.json"},
            "research-bot": {
                "url": "https://research.example.com/.well-known/agent-card.json",
                "custom_headers": {"X-API-Key": "key_123"},
            },
        }
    )

    a2a_session = A2ASession(
        agents=a2a_agents,
        task_store=JSONTaskStore(tmp_path / "tasks"),
        file_store=LocalFileStore(tmp_path / "files"),
    )

    a2a_tools = A2ATools(a2a_session)

    model = ChatOpenAI(
        model="gpt-5.1",
        reasoning={"effort": "medium"},
        api_key=lambda: "test",
    )
    agent = create_agent(model, tools=a2a_tools.tools)
    return {"agent": agent, "a2a_tools": a2a_tools}


def test_langchain_tools_example_uses_bound_tool_methods(tmp_path: Path) -> None:
    result = langchain_tools_example(tmp_path)

    agent = result["agent"]
    a2a_tools = result["a2a_tools"]
    assert isinstance(a2a_tools, A2ATools)
    assert hasattr(agent, "invoke")
    assert [tool.__name__ for tool in a2a_tools.tools] == [
        "get_agents",
        "get_agent",
        "send_message",
        "get_task",
        "view_text_artifact",
        "view_data_artifact",
    ]
    assert a2a_tools.tools[0].__doc__ == A2ATools.get_agents.__doc__

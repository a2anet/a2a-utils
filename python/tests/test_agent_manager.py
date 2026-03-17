"""Tests for a2a_utils.agent_manager."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from a2a_utils.client.agent_manager import AgentManager
from a2a_utils.types import AgentURLAndCustomHeaders


class TestConstructor:
    def test_none_config(self) -> None:
        manager = AgentManager(None)
        assert manager._config == {}
        assert manager._agents == {}

    def test_dict_config(self) -> None:
        config = {"my-agent": {"url": "https://example.com/agent-card.json"}}
        manager = AgentManager(config)
        assert "my-agent" in manager._config
        assert manager._config["my-agent"]["url"] == "https://example.com/agent-card.json"

    def test_empty_dict(self) -> None:
        manager = AgentManager({})
        assert manager._config == {}


class TestGetAgent:
    async def test_not_found(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        assert await manager.get_agent("nonexistent") is None

    async def test_found(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = MagicMock()
        manager._agents["my-agent"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )
        result = await manager.get_agent("my-agent")
        assert result is not None
        assert result.agent_card is card


class TestGetAgents:
    async def test_empty(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        assert await manager.get_agents() == {}

    async def test_returns_copy(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = MagicMock()
        manager._agents["a"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )
        result = await manager.get_agents()
        assert "a" in result
        # Verify it's a copy
        result["b"] = AgentURLAndCustomHeaders(agent_card=card, custom_headers={})
        assert "b" not in manager._agents


class TestGetAgentsForLlm:
    def _make_card(self, name: str, description: str, skills: list[dict[str, str]]) -> MagicMock:
        card = MagicMock()
        card.name = name
        card.description = description
        if skills:
            skill_mocks = []
            for s in skills:
                sm = MagicMock()
                sm.name = s["name"]
                sm.description = s.get("description", "")
                skill_mocks.append(sm)
            card.skills = skill_mocks
        else:
            card.skills = []
        return card

    async def test_no_agents(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        assert await manager.get_agents_for_llm() == {}

    async def test_name_detail(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = self._make_card("Test Agent", "A test", [{"name": "search"}])
        manager._agents["test"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )

        result = await manager.get_agents_for_llm("name")
        assert result == {"test": {"name": "Test Agent"}}

    async def test_basic_detail(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = self._make_card("Test Agent", "A test", [])
        manager._agents["test"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )

        result = await manager.get_agents_for_llm("basic")
        assert result == {"test": {"name": "Test Agent", "description": "A test"}}

    async def test_skills_detail(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = self._make_card("Test", "Desc", [{"name": "search", "description": "Find things"}])
        manager._agents["test"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )

        result = await manager.get_agents_for_llm("skills")
        assert result == {"test": {"name": "Test", "description": "Desc", "skills": ["search"]}}

    async def test_full_detail(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = self._make_card("Test", "Desc", [{"name": "search", "description": "Find things"}])
        manager._agents["test"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )

        result = await manager.get_agents_for_llm("full")
        assert result == {
            "test": {
                "name": "Test",
                "description": "Desc",
                "skills": [{"name": "search", "description": "Find things"}],
            }
        }

    async def test_default_is_basic(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = self._make_card("Test Agent", "A test", [{"name": "search"}])
        manager._agents["test"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )

        result = await manager.get_agents_for_llm()
        assert result == {"test": {"name": "Test Agent", "description": "A test"}}

    async def test_sorted_by_agent_id(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card_b = self._make_card("B Agent", "Agent B", [])
        card_a = self._make_card("A Agent", "Agent A", [])
        manager._agents["z-agent"] = AgentURLAndCustomHeaders(
            agent_card=card_b,
            custom_headers={},
        )
        manager._agents["a-agent"] = AgentURLAndCustomHeaders(
            agent_card=card_a,
            custom_headers={},
        )

        result = await manager.get_agents_for_llm("name")
        assert list(result.keys()) == ["a-agent", "z-agent"]
        assert result["a-agent"]["name"] == "A Agent"
        assert result["z-agent"]["name"] == "B Agent"


class TestGetAgentForLlm:
    def _make_card(self, name: str, description: str, skills: list[dict[str, str]]) -> MagicMock:
        card = MagicMock()
        card.name = name
        card.description = description
        if skills:
            skill_mocks = []
            for s in skills:
                sm = MagicMock()
                sm.name = s["name"]
                sm.description = s.get("description", "")
                skill_mocks.append(sm)
            card.skills = skill_mocks
        else:
            card.skills = []
        return card

    async def test_not_found(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        assert await manager.get_agent_for_llm("nonexistent") is None

    async def test_default_is_basic(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = self._make_card("Test", "Desc", [])
        manager._agents["test"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )

        result = await manager.get_agent_for_llm("test")
        assert result == {"name": "Test", "description": "Desc"}

    async def test_name_detail(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = self._make_card("Test", "Desc", [])
        manager._agents["test"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )

        result = await manager.get_agent_for_llm("test", detail="name")
        assert result == {"name": "Test"}

    async def test_skills_detail(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = self._make_card("Test", "Desc", [{"name": "search", "description": "Find things"}])
        manager._agents["test"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )

        result = await manager.get_agent_for_llm("test", detail="skills")
        assert result == {"name": "Test", "description": "Desc", "skills": ["search"]}

    async def test_full_detail(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        card = self._make_card("Test", "Desc", [{"name": "search", "description": "Find things"}])
        manager._agents["test"] = AgentURLAndCustomHeaders(
            agent_card=card,
            custom_headers={},
        )

        result = await manager.get_agent_for_llm("test", detail="full")
        assert result == {
            "name": "Test",
            "description": "Desc",
            "skills": [{"name": "search", "description": "Find things"}],
        }


class TestAddAgent:
    @pytest.mark.asyncio
    async def test_add_agent_success(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True

        card = MagicMock()
        with patch.object(manager, "_fetch_agent", new_callable=AsyncMock) as mock_fetch:

            async def side_effect(agent_id: str, config: dict[str, Any]) -> None:
                manager._agents[agent_id] = AgentURLAndCustomHeaders(
                    agent_card=card,
                    custom_headers=config.get("custom_headers", {}),
                )

            mock_fetch.side_effect = side_effect

            await manager.add_agent("new-agent", "https://example.com/card.json")

            mock_fetch.assert_called_once_with(
                "new-agent", {"url": "https://example.com/card.json", "custom_headers": {}}
            )
            result = await manager.get_agent("new-agent")
            assert result is not None
            assert result.agent_card is card

    @pytest.mark.asyncio
    async def test_add_agent_with_custom_headers(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True

        card = MagicMock()
        with patch.object(manager, "_fetch_agent", new_callable=AsyncMock) as mock_fetch:

            async def side_effect(agent_id: str, config: dict[str, Any]) -> None:
                manager._agents[agent_id] = AgentURLAndCustomHeaders(
                    agent_card=card,
                    custom_headers=config.get("custom_headers", {}),
                )

            mock_fetch.side_effect = side_effect

            await manager.add_agent(
                "new-agent",
                "https://example.com/card.json",
                custom_headers={"X-API-Key": "secret"},
            )

            mock_fetch.assert_called_once_with(
                "new-agent",
                {"url": "https://example.com/card.json", "custom_headers": {"X-API-Key": "secret"}},
            )

    @pytest.mark.asyncio
    async def test_add_agent_duplicate_raises(self) -> None:
        manager = AgentManager(None)
        manager._initialized = True
        manager._agents["existing"] = AgentURLAndCustomHeaders(
            agent_card=MagicMock(),
            custom_headers={},
        )

        with pytest.raises(ValueError, match="already registered"):
            await manager.add_agent("existing", "https://example.com/card.json")

    @pytest.mark.asyncio
    async def test_add_agent_triggers_lazy_init(self) -> None:
        manager = AgentManager(None)
        assert not manager._initialized

        with patch.object(manager, "_fetch_agent", new_callable=AsyncMock):
            await manager.add_agent("new-agent", "https://example.com/card.json")

        assert manager._initialized


class TestLazyInit:
    async def test_ensure_initialized_called_on_get_agent(self) -> None:
        manager = AgentManager(None)
        assert not manager._initialized
        await manager.get_agent("nonexistent")
        assert manager._initialized

    async def test_ensure_initialized_called_on_get_agents(self) -> None:
        manager = AgentManager(None)
        assert not manager._initialized
        await manager.get_agents()
        assert manager._initialized

    async def test_ensure_initialized_called_on_get_agent_for_llm(self) -> None:
        manager = AgentManager(None)
        assert not manager._initialized
        await manager.get_agent_for_llm("nonexistent")
        assert manager._initialized

    async def test_ensure_initialized_called_on_get_agents_for_llm(self) -> None:
        manager = AgentManager(None)
        assert not manager._initialized
        await manager.get_agents_for_llm()
        assert manager._initialized

    async def test_idempotent(self) -> None:
        manager = AgentManager(None)
        await manager._ensure_initialized()
        assert manager._initialized
        # Second call should be a no-op
        await manager._ensure_initialized()
        assert manager._initialized

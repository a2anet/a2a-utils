"""Agent management for A2A applications."""

import asyncio
import json
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from a2a.client import A2ACardResolver
from a2a.types import AgentCard
from loguru import logger

from ..types import AgentURLAndCustomHeaders


class A2AAgents:
    """Manages A2A agent cards keyed by user-defined agent IDs.

    Agents are configured via a dict mapping agent_id to config, or a JSON file path.
    """

    def __init__(
        self,
        agents: dict[str, dict[str, Any]] | str | Path | None = None,
        *,
        timeout: float = 15.0,
    ) -> None:
        """Initialize the agent manager.

        Args:
            agents: Agent config as:
              - dict: {"agent-id": {"url": "https://...", "custom_headers": {"X-API-Key": "..."}}}
              - str/Path: path to agents.json file with the same structure
              - None: empty, add agents later
            timeout: HTTP timeout in seconds for fetching agent cards (default: 15s).
        """
        self._timeout = timeout
        self._config = self._load_config(agents)
        self._agents: dict[str, AgentURLAndCustomHeaders] = {}
        self._init_errors: dict[str, str] = {}
        self._initialized: bool = False
        self._init_lock: asyncio.Lock = asyncio.Lock()

    def _load_config(
        self, agents: dict[str, dict[str, Any]] | str | Path | None
    ) -> dict[str, dict[str, Any]]:
        """Load and validate agent config."""
        if agents is None:
            return {}

        if isinstance(agents, (str, Path)):
            path = Path(agents)
            with open(path) as f:
                config: dict[str, dict[str, Any]] = json.load(f)
            return config

        return dict(agents)

    async def _ensure_initialized(self) -> None:
        """Lazily fetch all agent cards on first use (double-check locking)."""
        if self._initialized:
            return
        async with self._init_lock:
            if self._initialized:
                return

            if not self._config:
                logger.warning("No agents configured")
                self._initialized = True
                return

            tasks = [self._fetch_agent(agent_id, cfg) for agent_id, cfg in self._config.items()]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            self._init_errors = {}
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    aid = list(self._config.keys())[i]
                    url = self._config[aid].get("url", "unknown")
                    error_msg = f"{type(result).__name__}: {result}"
                    self._init_errors[aid] = error_msg
                    logger.error(f"Error loading agent '{aid}' from {url}: {error_msg}")

            if self._agents:
                logger.success(f"Successfully initialized {len(self._agents)} agent(s)")
            else:
                logger.warning("No agents were successfully initialized")

            self._initialized = True

    async def _fetch_agent(self, agent_id: str, config: dict[str, Any]) -> None:
        """Fetch a single agent card and register it."""
        url = config["url"]
        custom_headers = config.get("custom_headers", {})

        base_url, card_path = self._parse_agent_card_url(url)
        async with httpx.AsyncClient(timeout=httpx.Timeout(self._timeout)) as httpx_client:
            resolver = A2ACardResolver(
                httpx_client=httpx_client,
                base_url=base_url,
                agent_card_path=card_path,
            )
            http_kwargs = {"headers": custom_headers} if custom_headers else None
            agent_card = await resolver.get_agent_card(http_kwargs=http_kwargs)

        self._agents[agent_id] = AgentURLAndCustomHeaders(
            agent_card=agent_card,
            custom_headers=custom_headers,
        )

    def _parse_agent_card_url(self, url: str) -> tuple[str, str]:
        """Parse agent card URL into base_url and card_path."""
        parsed = urlparse(url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        card_path = parsed.path
        return base_url, card_path

    async def add_agent(
        self, agent_id: str, url: str, custom_headers: dict[str, str] | None = None
    ) -> None:
        """Register a new agent at runtime.

        Args:
            agent_id: User-defined agent identifier.
            url: Agent card URL.
            custom_headers: Optional custom HTTP headers.

        Raises:
            ValueError: If agent_id is already registered.
        """
        await self._ensure_initialized()
        if agent_id in self._agents:
            raise ValueError(f"Agent '{agent_id}' is already registered")
        config: dict[str, Any] = {"url": url, "custom_headers": custom_headers or {}}
        await self._fetch_agent(agent_id, config)

    async def get_agent(self, agent_id: str) -> AgentURLAndCustomHeaders | None:
        """Retrieve agent by ID.

        Args:
            agent_id: User-defined agent identifier.

        Returns:
            AgentURLAndCustomHeaders, or None if not found.
        """
        await self._ensure_initialized()
        return self._agents.get(agent_id)

    @property
    def initialization_errors(self) -> dict[str, str]:
        """Get errors from the most recent initialization attempt.

        Returns:
            Dict mapping agent_id to error message for agents that failed to load.
        """
        return dict(self._init_errors)

    async def get_agents(self) -> dict[str, AgentURLAndCustomHeaders]:
        """Get all registered agents.

        Returns:
            Dict mapping agent_id to AgentURLAndCustomHeaders.
        """
        await self._ensure_initialized()
        return dict(self._agents)

    def _format_agent_for_llm(
        self, card: AgentCard, detail: Literal["name", "basic", "skills", "full"]
    ) -> dict[str, Any]:
        """Format a single agent card into a summary dict.

        Args:
            card: The agent card to format.
            detail: Detail level — "name", "basic", "skills", or "full".

        Returns:
            Summary dict for the agent.
        """
        if detail == "name":
            return {"name": card.name}
        elif detail == "basic":
            return {"name": card.name, "description": card.description}
        elif detail == "skills":
            skill_names = [s.name for s in card.skills] if card.skills else []
            return {
                "name": card.name,
                "description": card.description,
                "skills": skill_names,
            }
        else:  # "full"
            skills = []
            if card.skills:
                for s in card.skills:
                    skills.append({"name": s.name, "description": s.description or ""})
            return {
                "name": card.name,
                "description": card.description,
                "skills": skills,
            }

    async def get_agent_for_llm(
        self,
        agent_id: str,
        detail: Literal["name", "basic", "skills", "full"] = "basic",
    ) -> dict[str, Any] | None:
        """Generate summary for a single agent.

        Args:
            agent_id: User-defined agent identifier.
            detail: Detail level — "name", "basic", "skills", or "full".

        Returns:
            Summary dict for the agent, or None if not found.
        """
        await self._ensure_initialized()
        agent = self._agents.get(agent_id)
        if agent is None:
            return None
        return self._format_agent_for_llm(agent.agent_card, detail)

    async def get_agents_for_llm(
        self, detail: Literal["name", "basic", "skills", "full"] = "basic"
    ) -> dict[str, dict[str, Any]]:
        """Generate summary of all agents.

        Args:
            detail: Detail level — "name", "basic", "skills", or "full".

        Returns:
            Dict mapping agent_id to summary dict, sorted by agent_id.
        """
        await self._ensure_initialized()
        return {
            agent_id: self._format_agent_for_llm(self._agents[agent_id].agent_card, detail)
            for agent_id in sorted(self._agents)
        }

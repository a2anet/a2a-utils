"""Typed dataclasses for LLM-facing A2A responses."""

from dataclasses import dataclass, field
from typing import Any

from a2a.types import AgentCard, TaskState


@dataclass(frozen=True)
class AgentURLAndCustomHeaders:
    agent_card: AgentCard
    custom_headers: dict[str, str] = field(default_factory=dict)


TERMINAL_OR_ACTIONABLE_STATES = frozenset(
    {
        TaskState.completed,
        TaskState.canceled,
        TaskState.failed,
        TaskState.rejected,
        TaskState.input_required,
        TaskState.auth_required,
    }
)


@dataclass(frozen=True)
class ArtifactSettings:
    """Configuration for artifact minimization and viewing."""

    send_message_character_limit: int = 50_000
    minimized_object_string_length: int = 5_000
    view_artifact_character_limit: int = 50_000


# -- LLM-facing part types (simple, no SDK wrapper overhead) --


@dataclass(frozen=True)
class TextPartForLLM:
    kind: str  # "text"
    text: str


@dataclass(frozen=True)
class DataPartForLLM:
    kind: str  # "data"
    data: Any


@dataclass(frozen=True)
class FilePartForLLM:
    kind: str  # "file"
    name: str | None
    mime_type: str | None
    uri: str | dict[str, Any] | None
    bytes: dict[str, Any] | None


@dataclass(frozen=True)
class ArtifactForLLM:
    artifact_id: str
    description: str | None
    name: str | None
    parts: list[TextPartForLLM | DataPartForLLM | FilePartForLLM]


@dataclass(frozen=True)
class MessageForLLM:
    context_id: str | None
    kind: str  # "message"
    parts: list[TextPartForLLM | DataPartForLLM | FilePartForLLM]


@dataclass(frozen=True)
class TaskStatusForLLM:
    state: TaskState
    message: MessageForLLM | None = None


@dataclass(frozen=True)
class TaskForLLM:
    id: str
    context_id: str
    kind: str  # "task"
    status: TaskStatusForLLM
    artifacts: list[ArtifactForLLM]

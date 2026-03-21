# SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
#
# SPDX-License-Identifier: Apache-2.0
from a2a_utils.__about__ import __version__

from a2a_utils.client.a2a_session import A2ASession
from a2a_utils.client.a2a_tools import A2ATools
from a2a_utils.client.agent_manager import AgentManager
from a2a_utils.artifacts import (
    DataArtifacts,
    TextArtifacts,
    minimize_artifacts,
)
from a2a_utils.files import FileStore, LocalFileStore
from a2a_utils.tasks.json_task_store import JSONTaskStore
from a2a_utils.types import (
    TERMINAL_OR_ACTIONABLE_STATES,
    AgentURLAndCustomHeaders,
    ArtifactForLLM,
    ArtifactSettings,
    DataPartForLLM,
    FilePartForLLM,
    MessageForLLM,
    TaskForLLM,
    TaskStatusForLLM,
    TextPartForLLM,
)

__all__ = [
    "__version__",
    # core
    "A2ASession",
    "A2ATools",
    "AgentManager",
    "JSONTaskStore",
    # artifacts
    "DataArtifacts",
    "TextArtifacts",
    "minimize_artifacts",
    # files
    "FileStore",
    "LocalFileStore",
    # types
    "TERMINAL_OR_ACTIONABLE_STATES",
    "AgentURLAndCustomHeaders",
    "ArtifactForLLM",
    "ArtifactSettings",
    "DataPartForLLM",
    "FilePartForLLM",
    "MessageForLLM",
    "TaskForLLM",
    "TaskStatusForLLM",
    "TextPartForLLM",
]

# A2A Utils Python

[![PyPI - Version](https://img.shields.io/pypi/v/a2a-utils.svg)](https://pypi.org/project/a2a-utils) [![PyPI - Python Version](https://img.shields.io/pypi/pyversions/a2a-utils.svg)](https://pypi.org/project/a2a-utils) [![PyPI - Downloads](https://img.shields.io/pypi/dm/a2a-utils)](https://pypi.org/project/a2a-utils) [![License](https://img.shields.io/github/license/a2anet/a2a-utils)](https://github.com/a2anet/a2a-utils/blob/main/LICENSE) [![A2A Protocol](https://img.shields.io/badge/A2A-Protocol-blue)](https://a2a-protocol.org) [![Discord](https://img.shields.io/discord/1391916121589944320?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/674NGXpAjU)

This package is a comprehensive set of utility functions for using [A2A servers (remote agents)](https://a2a-protocol.org/latest/topics/key-concepts/#core-actors-in-a2a-interactions), it powers the [A2A MCP Server](https://github.com/a2anet/a2a-mcp).

`A2ASession` is at the core of the package, it takes an `AgentManager` (for connecting to agents, viewing Agent Cards, etc.), and optionally a `TaskStore` (for saving Tasks) and `FileStore` (for saving files).
It has two methods, `send_message` and `get_task`.

These methods are more sophisticated versions of the same methods in the [A2A SDKs](https://github.com/orgs/a2aproject/repositories).
For example, `send_message` abstracts retrieving Agent Cards, sending headers, etc., allowing you to send a message with an agent's ID, e.g. `send_message("research-bot", "Find recent papers on quantum computing")`.
It also sends the message as non-blocking and streams the response until the Task reaches a terminal state or times out.
If `send_message` times out, `get_task` can be called with the Task ID to start streaming the response again.
If `TaskStore` and `FileStore` are set, the Task, Artifacts, and files will automatically be saved.

`AgentManager` stores user-defined agent IDs that link to Agent Card URLs and headers.
Agents are stored this way so that Agent Card URLs and headers are not exposed to the agent and because Agent Cards can be dynamic (i.e. change depending on the headers).
It has five methods, `get_agents`, `get_agents_for_llm`, `get_agent`, `get_agent_for_llm`, and `add_agent`.
See the API reference below for more information.

Lastly, `A2ATools` is the most sophisticated class in the package, it takes an `A2ASession` and provides six LLM-friendly tools that can be used out-of-the-box with agent frameworks: `get_agents`, `get_agent`, `send_message`, `get_task`, `view_text_artifact`, and `view_data_artifact`.
The tools are based on [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents): they have LLM-friendly docstrings, return JSON-serialisable objects, and return actionable error messages.

Tool outputs are also optimised for LLMs.
For example, `get_agents` returns a list of agent names and descriptions, whereas `get_agent` also returns an agent's skill names and descriptions.
`send_message` and `get_task` return LLM-friendly types that are subsets of A2A types (e.g. `TaskForLLM`, `MessageForLLM`, and `ArtifactForLLM`) and automatically minimise large Artifacts, which can be viewed with `view_text_artifact` and `view_data_artifact`.

## 📦 Installation

To install with pip:

```bash
pip install a2a-utils
```

To install with uv:

```bash
uv add a2a-utils
```

## 🚀 Quick Start

Create an `A2ASession`, then `A2ATools` to get LLM-friendly tools that can be used out-of-the-box with agent frameworks.

```python
from pathlib import Path

from a2a_utils import A2ATools, A2ASession, AgentManager, JSONTaskStore, LocalFileStore
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

agent_manager = AgentManager({
    "weather": {"url": "https://weather.example.com/.well-known/agent-card.json"},
    "research-bot": {
        "url": "https://research.example.com/.well-known/agent-card.json",
        "custom_headers": {"X-API-Key": "key_123"},
    },
})

a2a_session = A2ASession(
    agent_manager=agent_manager, 
    task_store=JSONTaskStore(Path("./storage/tasks")), 
    file_store=LocalFileStore(Path("./storage/files"))
)

a2a_tools = A2ATools(a2a_session)

model = ChatOpenAI(model="gpt-5.1", reasoning={"effort": "medium"})

agent = create_agent(model, tools=a2a_tools)
```

## 📖 API Reference

### A2ATools

Ready-made tools for agents to communicate with A2A servers. Every method has LLM-friendly docstrings, returns JSON-serialisable objects, and returns actionable error messages.

```python
from a2a_utils import A2ATools, A2ASession, AgentManager

tools = A2ATools(session)
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `session` | `A2ASession` | Yes | The session instance for sending messages and managing agents |
| `artifact_settings` | `ArtifactSettings \| None` | No | Minimization/view settings (default: `ArtifactSettings()`) |

`artifact_settings` determines how Artifacts are minimized and viewed:

```python
from a2a_utils import ArtifactSettings

settings = ArtifactSettings(
    send_message_character_limit=100_000,
    minimized_object_string_length=10_000,
    view_artifact_character_limit=100_000,
)
tools = A2ATools(session, artifact_settings=settings)
```

| Field | Type | Default | Description |
|---|---|---|---|
| `send_message_character_limit` | `int` | `50,000` | Character limit above which artifacts are minimized in `send_message` |
| `minimized_object_string_length` | `int` | `5,000` | Max length for individual string values within minimized data objects |
| `view_artifact_character_limit` | `int` | `50,000` | Character limit for output from `view_text_artifact` / `view_data_artifact` |

#### `async get_agents() -> dict[str, Any]`

List all available agents with their names and descriptions.

```python
result = await tools.get_agents()
```

Example result:

```json
{
  "research-bot": {
    "name": "Research Bot",
    "description": "Find and summarize research papers"
  },
  "weather": {
    "name": "Weather Agent",
    "description": "Get weather forecasts for any location"
  }
}
```

#### `async get_agent(agent_id: str) -> dict[str, Any]`

Get detailed information about a specific agent, including its skills.

```python
result = await tools.get_agent("research-bot")
```

Example result:

```json
{
  "name": "Research Bot",
  "description": "Find and summarize research papers",
  "skills": [
    {
      "name": "Search Papers",
      "description": "Search for papers by topic, author, or keyword"
    },
    {
      "name": "Summarize Paper",
      "description": "Generate a summary of a specific paper"
    }
  ]
}
```

#### `async send_message(agent_id, message, context_id?, task_id?, timeout?) -> dict[str, Any]`

Send a message to an agent and receive a structured response. The response includes the agent's reply and any generated Artifacts. Artifacts are automatically minimized to fit the context window.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | `str` | Yes | ID of the agent to message (from get_agents) |
| `message` | `str` | Yes | The message content to send |
| `context_id` | `str \| None` | No | Continue an existing conversation by providing its context ID |
| `task_id` | `str \| None` | No | Attach to an existing task (for input_required flows) |
| `timeout` | `float \| None` | No | Override the default timeout in seconds |

```python
result = await tools.send_message(
    "research-bot", "Find recent papers on quantum computing"
)
```

Example result:

```json
{
    "id": "task-123",
    "context_id": "ctx-456",
    "kind": "task",
    "status": {
        "state": "completed",
        "message": "I found three recent papers on quantum computing and retrieved the abstract for the most recent one."
    },
    "artifacts": [
        {
            "artifact_id": "art-789",
            "description": "Search results for quantum computing papers",
            "name": "Search Results",
            "parts": [
                {
                    "kind": "data",
                    "data": [
                        {
                          "title": "Quantum Error Correction Advances",
                          "year": 2025,
                          "authors": "Chen et al."
                        },
                        {
                          "title": "Topological Quantum Computing Survey",
                          "year": 2024,
                          "authors": "Nakamura et al."
                        },
                        {
                          "title": "Fault-Tolerant Logical Qubits",
                          "year": 2024,
                          "authors": "Wang et al."
                        }
                    ]
                }
            ]
        },
        {
            "artifact_id": "art-790",
            "description": "Abstract of 'Quantum Error Correction Advances' by Chen et al.",
            "name": "Abstract",
            "parts": [
                {
                    "kind": "text",
                    "text": "Quantum computing has seen rapid advances in error correction.\nRecent work demonstrates fault-tolerant logical qubits at scale.\nThis paper surveys progress in quantum error correction from 2023-2025.\nWe review surface codes, color codes, and novel hybrid approaches.\nKey results include a 10x reduction in logical error rates.\nThese improvements bring practical quantum computing closer to reality.\nWe also discuss remaining challenges in qubit connectivity.\nFinally, we outline a roadmap for achieving fault-tolerant quantum computation."
                }
            ]
        }
    ]
}
```

Continue the conversation using `context_id`:

```python
result_2 = await tools.send_message(
    "research-bot",
    "Summarize the most recent result",
    context_id="ctx-456",
)
```

#### `async get_task(agent_id, task_id, timeout?, poll_interval?) -> dict[str, Any]`

Check the progress of a task that is still in progress. Use this after `send_message` returns a task in a non-terminal state (e.g. `"working"`).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | `str` | Yes | ID of the agent that owns the task |
| `task_id` | `str` | Yes | Task ID from a previous send_message response |
| `timeout` | `float \| None` | No | Override the monitoring timeout in seconds |
| `poll_interval` | `float \| None` | No | Override the interval between status checks in seconds |

```python
result = await tools.get_task("research-bot", "task-123")
```

#### `async view_text_artifact(agent_id, task_id, artifact_id, line_start?, line_end?, character_start?, character_end?) -> dict[str, Any]`

View text content from an artifact, optionally selecting a range. Use this for artifacts containing text (documents, logs, code, etc.).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | `str` | Yes | ID of the agent that produced the artifact |
| `task_id` | `str` | Yes | Task ID containing the artifact |
| `artifact_id` | `str` | Yes | The artifact's unique identifier |
| `line_start` | `int \| None` | No | Starting line number (1-based, inclusive) |
| `line_end` | `int \| None` | No | Ending line number (1-based, inclusive) |
| `character_start` | `int \| None` | No | Starting character index (0-based, inclusive) |
| `character_end` | `int \| None` | No | Ending character index (0-based, exclusive) |

```python
result = await tools.view_text_artifact(
    "research-bot", "task-123", "art-790", line_start=1, line_end=3
)
```

Example result:

```json
{
    "artifact_id": "art-790",
    "description": "Abstract of 'Quantum Error Correction Advances' by Chen et al.",
    "name": "Abstract",
    "parts": [
        {
            "kind": "text",
            "text": "Quantum computing has seen rapid advances in error correction.\nRecent work demonstrates fault-tolerant logical qubits at scale.\nThis paper surveys progress in quantum error correction from 2023-2025."
        }
    ]
}
```

#### `async view_data_artifact(agent_id, task_id, artifact_id, json_path?, rows?, columns?) -> dict[str, Any]`

View structured data from an artifact with optional filtering. Use this for artifacts containing JSON data (objects, arrays, tables).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | `str` | Yes | ID of the agent that produced the artifact |
| `task_id` | `str` | Yes | Task ID containing the artifact |
| `artifact_id` | `str` | Yes | The artifact's unique identifier |
| `json_path` | `str \| None` | No | Dot-separated path to navigate into the data (e.g. `"results.items"`) |
| `rows` | `str \| None` | No | Row selection: `"0"`, `"0-10"`, `"0,2,5"`, `"all"` |
| `columns` | `str \| None` | No | Column selection: `"name"`, `"name,age"`, `"all"` |

```python
result = await tools.view_data_artifact(
    "research-bot", "task-123", "art-789",
    rows="0-1", columns="title,year",
)
```

Example result:

```json
{
    "artifact_id": "art-789",
    "description": "Search results for quantum computing papers",
    "name": "Search Results",
    "parts": [
        {
            "kind": "data",
            "data": [
                {"title": "Quantum Error Correction Advances", "year": 2025},
                {"title": "Topological Quantum Computing Survey", "year": 2024}
            ]
        }
    ]
}
```

### A2ASession

Programmatic interface for sending messages to A2A agents. Returns full A2A SDK types (`Task`, `Message`) for direct use.

```python
from pathlib import Path
from a2a_utils import A2ASession, AgentManager, JSONTaskStore, LocalFileStore

session = A2ASession(
    agent_manager=AgentManager({
        "research-bot": {"url": "https://research-bot.example.com/.well-known/agent-card.json"}
    }),
    task_store=JSONTaskStore(Path("./storage/tasks")),
    file_store=LocalFileStore(Path("./storage/files")),
)
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_manager` | `AgentManager` | Yes | The agent manager instance |
| `task_store` | `TaskStore \| None` | No | Task store for persistence (default: `InMemoryTaskStore`) |
| `file_store` | `FileStore \| None` | No | File store for saving file artifacts (default: `None`) |
| `send_message_timeout` | `float` | No | HTTP timeout in seconds for `send_message` (default: `60.0`) |
| `get_task_timeout` | `float` | No | Total monitoring timeout in seconds for `get_task` (default: `60.0`) |
| `get_task_poll_interval` | `float` | No | Interval in seconds between `get_task` polls (default: `5.0`) |

#### `async send_message(agent_id: str, message: str, *, context_id: str | None = None, task_id: str | None = None, timeout: float | None = None) -> Task | Message`

Send a message to an A2A agent. The returned task is automatically saved to the task store. File artifacts are saved via the file store.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | `str` | Yes | Registered agent identifier |
| `message` | `str` | Yes | The message content to send |
| `context_id` | `str \| None` | No | Context ID to continue a conversation (auto-generated when None) |
| `task_id` | `str \| None` | No | Task ID to attach to the message |
| `timeout` | `float \| None` | No | Override HTTP timeout in seconds (default: `send_message_timeout`) |

```python
from a2a.types import Task, Message

response = await session.send_message(
    "research-bot", "Find recent papers on quantum computing"
)
```

Continue the conversation using `context_id`:

```python
response_2 = await session.send_message(
    "research-bot",
    "Summarize the most recent result",
    context_id=response.context_id,
)
```

**Returns:** `Task | Message` (from `a2a.types`)

#### `async get_task(agent_id: str, task_id: str, *, timeout: float | None = None, poll_interval: float | None = None) -> Task`

Get the current state of a task. Monitors until a terminal state (`completed`, `canceled`, `failed`, `rejected`) or actionable state (`input_required`, `auth_required`) is reached, or until timeout. Uses SSE resubscription if the agent supports streaming, otherwise polls at regular intervals.

On monitoring timeout, returns the current task state (which may still be non-terminal, e.g. `working`). The only errors from `get_task` are failed HTTP requests (agent down, network error).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | `str` | Yes | Registered agent identifier |
| `task_id` | `str` | Yes | Task ID from a previous `send_message` call |
| `timeout` | `float \| None` | No | Override monitoring timeout in seconds (default: `get_task_timeout`) |
| `poll_interval` | `float \| None` | No | Override interval between polls in seconds (default: `get_task_poll_interval`) |

```python
task = await session.get_task("research-bot", "task-123")
```

**Returns:** `Task` (from `a2a.types`)

### AgentManager

Manages A2A agent cards keyed by user-defined agent IDs.

```python
from a2a_utils import AgentManager

# From dict
manager = AgentManager({
    "language-translator": {
        "url": "https://example.com/language-translator/agent-card.json",
        "custom_headers": {"Authorization": "Bearer tok_123"},
    }
})

# From JSON file
manager = AgentManager("./agents.json")

# Empty — add agents later
manager = AgentManager()
```

#### `async get_agents() -> dict[str, AgentURLAndCustomHeaders]`

Get all registered agents.
Note: this should NOT be added to the LLM's context, use `get_agents_for_llm` instead.

**Returns:** `dict[str, AgentURLAndCustomHeaders]`

```python
agents = await manager.get_agents()
```

Example result:

```python
{
    "language-translator": AgentURLAndCustomHeaders(
        agent_card=AgentCard(
            name="Universal Translator",
            description="Translate text and audio between 50+ languages",
            ...
        ),
        custom_headers={"Authorization": "Bearer tok_123"},
    ),
    "code-reviewer": AgentURLAndCustomHeaders(
        agent_card=AgentCard(
            name="Code Reviewer",
            description="Review code for best practices",
            ...
        ),
        custom_headers={"X-API-Key": "key_123"},
    ),
}
```

#### `async get_agents_for_llm(detail: str = "basic") -> dict[str, dict[str, Any]]`

Generate summary of all agents, sorted by agent_id.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `detail` | `str` | No | Detail level: `"name"`, `"basic"` (default), `"skills"`, or `"full"` |

**Returns:** `dict[str, dict[str, Any]]`

`"name"`:

```python
summaries = await manager.get_agents_for_llm("name")
```

```json
{
  "code-reviewer": {"name": "Code Reviewer"},
  "language-translator": {"name": "Universal Translator"}
}
```

`"basic"` (default):

```python
summaries = await manager.get_agents_for_llm()
```

```json
{
  "code-reviewer": {
    "name": "Code Reviewer",
    "description": "Review code for best practices"
  },
  "language-translator": {
    "name": "Universal Translator",
    "description": "Translate text and audio between 50+ languages"
  }
}
```

`"skills"`:

```python
summaries = await manager.get_agents_for_llm("skills")
```

```json
{
  "code-reviewer": {
    "name": "Code Reviewer",
    "description": "Review code for best practices",
    "skills": ["Review Code"]
  },
  "language-translator": {
    "name": "Universal Translator",
    "description": "Translate text between 50+ languages",
    "skills": ["Translate Text", "Translate Audio"]
  }
}
```

`"full"`:

```python
summaries = await manager.get_agents_for_llm("full")
```

```json
{
  "code-reviewer": {
    "name": "Code Reviewer",
    "description": "Review code for best practices",
    "skills": [
      {
        "name": "Review Code",
        "description": "Review code for best practices, identify bugs, and suggest improvements"
      }
    ]
  },
  "language-translator": {
    "name": "Universal Translator",
    "description": "Translate text between 50+ languages",
    "skills": [
      {
        "name": "Translate Text",
        "description": "Translate text between any supported language pair"
      },
      {
        "name": "Translate Audio",
        "description": "Translate audio between any supported language pair"
      }
    ]
  }
}
```

#### `async get_agent(agent_id: str) -> AgentURLAndCustomHeaders | None`

Retrieve agent by ID.
Note: this should NOT be added to the LLM's context, use `get_agent_for_llm` instead.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | `str` | Yes | User-defined agent identifier |

**Returns:** [`AgentURLAndCustomHeaders`](#agenturlandcustomheaders) | `None`

```python
agent = await manager.get_agent("language-translator")
```

Example result:

```python
AgentURLAndCustomHeaders(
    agent_card=AgentCard(
        name="Universal Translator",
        description="Translate text and audio between 50+ languages",
        url="https://translate.example.com",
        version="1.0.0",
        capabilities=AgentCapabilities(streaming=False, pushNotifications=False),
        skills=[
            AgentSkill(
                id="translate-text",
                name="Translate Text",
                description="Translate text between any supported language pair",
                tags=["translate", "text", "language"],
                examples=["Translate 'hello' to French"],
            ),
            AgentSkill(
                id="translate-audio",
                name="Translate Audio",
                description="Translate audio between any supported language pair",
                tags=["translate", "audio", "language"],
            )
        ],
        defaultInputModes=["text", "audio/mpeg"],
        defaultOutputModes=["text", "audio/mpeg"],
    ),
    custom_headers={"Authorization": "Bearer tok_123"},
)
```

Returns `None` if the agent ID is not registered.

#### `async get_agent_for_llm(agent_id: str, detail: str = "basic") -> dict[str, Any] | None`

Generate summary for a single agent.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | `str` | Yes | User-defined agent identifier |
| `detail` | `str` | No | Detail level: `"name"`, `"basic"` (default), `"skills"`, or `"full"` |

**Returns:** `dict[str, Any] | None` — summary dict or `None` if not found.

```python
summary = await manager.get_agent_for_llm("language-translator")
```

```json
{
  "name": "Universal Translator",
  "description": "Translate text and audio between 50+ languages"
}
```

#### `async add_agent(agent_id: str, url: str, custom_headers: dict[str, str] | None = None) -> None`

Register a new agent at runtime.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `agent_id` | `str` | Yes | User-defined agent identifier |
| `url` | `str` | Yes | Agent card URL |
| `custom_headers` | `dict[str, str] \| None` | No | Custom HTTP headers |

**Raises:** `ValueError` if `agent_id` is already registered.

```python
await manager.add_agent(
    "code-reviewer",
    "https://review.example.com/.well-known/agent-card.json",
    custom_headers={"X-API-Key": "key_123"},
)
```

### 💾 JSONTaskStore

Persists Task objects as individual JSON files. Implements the A2A SDK `TaskStore` ABC.

```python
from pathlib import Path
from a2a_utils import JSONTaskStore

task_store = JSONTaskStore(Path("./storage/tasks"))
```

#### `async save(task: Task) -> None`

Save a task to disk. Creates `./storage/tasks/{task_id}.json`.

#### `async get(task_id: str) -> Task | None`

Load a task from disk.

Returns `None` if the task file does not exist.

#### `async delete(task_id: str) -> None`

Delete a task from disk.

### 📁 Files

#### FileStore

Abstract base class for file storage. Implement this to use custom storage backends (S3, GCS, etc.).

```python
from abc import ABC, abstractmethod
from a2a.types import Artifact

class FileStore(ABC):
    @abstractmethod
    async def save(self, task_id: str, artifact: Artifact) -> list[str]:
        """Save file parts from an artifact. Returns list of storage locations."""

    @abstractmethod
    async def get(self, task_id: str, artifact_id: str) -> list[str]:
        """Get storage locations for a saved artifact's files. Returns empty list if not found."""

    @abstractmethod
    async def delete(self, task_id: str, artifact_id: str) -> None:
        """Delete saved files for an artifact."""
```

#### LocalFileStore

Saves artifact file parts to the local filesystem. Files are stored at `storage_dir/task_id/artifact_id/filename`.

```python
from pathlib import Path
from a2a_utils import LocalFileStore

file_store = LocalFileStore(Path("./storage/files"))
```

##### `async save(task_id: str, artifact: Artifact) -> list[str]`

Save file parts from an artifact to disk.

```python
saved_paths = await file_store.save("task-123", artifact)
```

Example result:

```python
["./storage/files/task-123/art-789/quarterly_report.pdf"]
```

##### `async get(task_id: str, artifact_id: str) -> list[str]`

Get saved file paths for an artifact.

```python
paths = await file_store.get("task-123", "art-789")
```

Example result:

```python
["./storage/files/task-123/art-789/quarterly_report.pdf"]
```

Returns an empty list if no files are found.

##### `async delete(task_id: str, artifact_id: str) -> None`

Delete saved files for an artifact.

```python
await file_store.delete("task-123", "art-789")
```

### 🎨 Artifacts

`A2ATools` uses the `TextArtifacts` and `DataArtifacts` classes to automatically minimize Artifacts returned from `send_message` and view Artifacts using `view_text_artifact` and `view_data_artifact`. They can also be used independently on raw data.

#### TextArtifacts

##### `TextArtifacts.view(text, *, line_start=None, line_end=None, character_start=None, character_end=None, character_limit=50_000) -> str`

View text content with optional line or character range selection. Supports line selection (1-based, inclusive) or character selection (0-based, Python slice semantics). These are mutually exclusive — providing both raises `ValueError`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | `str` | Yes | The text to view |
| `line_start` | `int \| None` | No | Starting line number (1-based, inclusive) |
| `line_end` | `int \| None` | No | Ending line number (1-based, inclusive) |
| `character_start` | `int \| None` | No | Starting character index (0-based, inclusive) |
| `character_end` | `int \| None` | No | Ending character index (0-based, exclusive) |
| `character_limit` | `int` | No | Maximum output size (default: `50,000`) |

**Returns:** `str`

Line selection:

```python
from a2a_utils import TextArtifacts

text = "[INFO] Server started\n[INFO] Connected to DB\n[WARN] Cache miss\n[INFO] Request OK"
TextArtifacts.view(text, line_start=1, line_end=2)
```

Example result:

```
"[INFO] Server started\n[INFO] Connected to DB"
```

Character selection:

```python
TextArtifacts.view("Hello, World!", character_start=0, character_end=5)
```

Example result:

```
"Hello"
```

##### `TextArtifacts.minimize(text, *, character_limit=50_000, tip=None) -> dict[str, Any]`

Minimize text content for display. If text is within the character limit, returns it unchanged. If over the limit, shows first and last halves with metadata.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | `str` | Yes | The text content to minimize |
| `character_limit` | `int` | No | Character limit (default: `50,000`) |
| `tip` | `str \| None` | No | Tip string (default: `None`; pass a string to include one) |

**Returns:** `dict[str, Any]`

Short text (under limit):

```python
from a2a_utils import TextArtifacts

TextArtifacts.minimize("Hello, world!")
```

```json
{"text": "Hello, world!"}
```

Long text (over limit):

```python
from a2a_utils import TextArtifacts

TextArtifacts.minimize("x" * 60_000)
```

```json
{
    "text": "xxxxxxx...\n\n[... 10,000 characters omitted ...]\n\nxxxxxxx...",
    "_total_lines": 1,
    "_total_characters": 60000,
    "_start_line_range": "1-1",
    "_end_line_range": "1-1",
    "_start_character_range": "0-25000",
    "_end_character_range": "35000-60000"
}
```

#### DataArtifacts

##### `DataArtifacts.view(data, *, json_path=None, rows=None, columns=None, character_limit=50_000) -> Any`

View structured data with optional filtering. Navigate with `json_path`, then filter with `rows`/`columns`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | `Any` | Yes | The data to view |
| `json_path` | `str \| None` | No | Dot-separated path to extract specific fields |
| `rows` | `int \| list[int] \| str \| None` | No | Row selection |
| `columns` | `str \| list[str] \| None` | No | Column selection |
| `character_limit` | `int` | No | Maximum output size (default: `50,000`) |

**Returns:** `Any` (filtered data)

```python
from a2a_utils import DataArtifacts

data = {
    "employees": [
        {"name": "Alice", "department": "Engineering", "level": 5},
        {"name": "Bob", "department": "Design", "level": 3},
        {"name": "Carol", "department": "Engineering", "level": 4},
    ]
}

DataArtifacts.view(data, json_path="employees", rows="0-2", columns=["name", "department"])
```

Example result:

```json
[
    {"name": "Alice", "department": "Engineering"},
    {"name": "Bob", "department": "Design"}
]
```

##### `DataArtifacts.minimize(data, *, character_limit=50_000, minimized_object_string_length=5_000, tip=None) -> dict[str, Any]`

Minimize data content for display based on type. Automatically selects the best strategy: list-of-objects gets a table summary, dicts get string truncation, strings delegate to `TextArtifacts.minimize`.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | `Any` | Yes | The data to minimize |
| `character_limit` | `int` | No | Character limit (default: `50,000`) |
| `minimized_object_string_length` | `int` | No | Max string length in objects (default: `5,000`) |
| `tip` | `str \| None` | No | Tip string (default: `None`; pass a string to include one) |

**Returns:** `dict[str, Any]`

```python
from a2a_utils import DataArtifacts

data = {
    "title": "Quarterly Report Q4 2025",
    "summary": "x" * 10_000,
    "metrics": {"revenue": 1_250_000, "growth": 12.5},
    "employees": [
        {
            "name": f"Employee {i}",
            "department": ["Eng", "Marketing", "Design", "Sales"][i % 4],
            "salary": 60_000 + i * 500,
        }
        for i in range(100)
    ],
    "tags": ["finance", "quarterly", "internal"],
}
DataArtifacts.minimize(data, character_limit=100, minimized_object_string_length=10)
```

```json
{
    "data": {
        "title": "Quarterly ... [14 more chars]",
        "summary": "xxxxxxxxxx... [9,990 more chars]",
        "metrics": {
            "revenue": 1250000,
            "growth": 12.5
        },
        "employees": {
            "_total_rows": 100,
            "_columns": [
                {
                    "count": 100,
                    "unique_count": 100,
                    "types": [{
                        "name": "string",
                        "count": 100,
                        "percentage": 100.0,
                        "sample_value": "Employee 42",
                        "length_minimum": 10,
                        "length_maximum": 11,
                        "length_average": 10.9,
                        "length_stdev": 0.3
                    }],
                    "name": "name"
                },
                {
                    "count": 100,
                    "unique_count": 4,
                    "types": [{
                        "name": "string",
                        "count": 100,
                        "percentage": 100.0,
                        "sample_value": "Engineering",
                        "length_minimum": 5,
                        "length_maximum": 11,
                        "length_average": 7.75,
                        "length_stdev": 2.4
                    }],
                    "name": "department"
                },
                {
                    "count": 100,
                    "unique_count": 100,
                    "types": [{
                        "name": "int",
                        "count": 100,
                        "percentage": 100.0,
                        "sample_value": 75000,
                        "minimum": 60000,
                        "maximum": 109500,
                        "average": 84750,
                        "stdev": 14505.75
                    }],
                    "name": "salary"
                }
            ],
            "_json_path": "employees"
        },
        "tags": ["finance", "quarterly", "internal"]
    }
}
```

Lists of dictionaries are summarized as table summaries (see `summarize_table`) and lists of values as value summaries (see `summarize_values`).

##### `DataArtifacts.summarize_table(data) -> list[dict[str, Any]]`

Generate a summary of tabular data (list of dicts). Returns one summary dict per column with count, unique count, and per-type statistics.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `data` | `list[dict[str, Any]]` | Yes | Table rows |

**Returns:** `list[dict[str, Any]]`

```python
from a2a_utils import DataArtifacts

# Same dataset as the minimize example above
data = [
    {
        "name": f"Employee {i}",
        "department": ["Eng", "Marketing", "Design", "Sales"][i % 4],
        "salary": 60_000 + i * 500,
    }
    for i in range(100)
]

DataArtifacts.summarize_table(data)
```

```json
[
    {
        "count": 100,
        "unique_count": 100,
        "types": [
            {
                "name": "string",
                "count": 100,
                "percentage": 100.0,
                "sample_value": "Employee 42",
                "length_minimum": 10,
                "length_maximum": 11,
                "length_average": 10.9,
                "length_stdev": 0.3
            }
        ],
        "name": "name"
    },
    {
        "count": 100,
        "unique_count": 4,
        "types": [
            {
                "name": "string",
                "count": 100,
                "percentage": 100.0,
                "sample_value": "Engineering",
                "length_minimum": 5,
                "length_maximum": 11,
                "length_average": 7.75,
                "length_stdev": 2.4
            }
        ],
        "name": "department"
    },
    {
        "count": 100,
        "unique_count": 100,
        "types": [
            {
                "name": "int",
                "count": 100,
                "percentage": 100.0,
                "sample_value": 75000,
                "minimum": 60000,
                "maximum": 109500,
                "average": 84750,
                "stdev": 14505.75
            }
        ],
        "name": "salary"
    }
]
```

##### `DataArtifacts.summarize_values(values) -> dict[str, Any] | list[Any]`

Generate statistics for a list of values (like a single column). Includes count, unique count, and per-type statistics (min/max/avg/stdev for numbers, length stats for strings, etc.). If the summary would be larger than the original values, the original list is returned instead (inflation guard).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `values` | `list[Any]` | Yes | Values to summarize |

**Returns:** `dict[str, Any] | list[Any]`

```python
from a2a_utils import DataArtifacts

salaries = [
    95000, 72000, 105000, 68000, 88000,
    # ... ~100 salary values total, with some nulls
    None, 115000, 92000, None, 78000,
]

DataArtifacts.summarize_values(salaries)
```

```json
{
    "count": 100,
    "unique_count": 87,
    "types": [
        {
            "name": "int",
            "count": 92,
            "percentage": 92.0,
            "sample_value": 95000,
            "minimum": 45000,
            "maximum": 185000,
            "average": 87250.5,
            "stdev": 28430.12
        },
        {
            "name": "null",
            "count": 8,
            "percentage": 8.0,
            "sample_value": null
        }
    ]
}
```

#### `minimize_artifacts(artifacts, *, character_limit=50_000, minimized_object_string_length=5_000, saved_file_paths=None, text_tip=None, data_tip=None) -> list[ArtifactForLLM]`

Minimize a list of artifacts for LLM display. Called automatically by `A2ATools.send_message`. Combines all TextParts within each artifact into a single [`TextPartForLLM`](#textpartforllm). Handles `FilePart`s by including file metadata and saved paths.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `artifacts` | `list[Artifact]` | Yes | List of artifacts to minimize |
| `character_limit` | `int` | No | Character limit (default: `50,000`) |
| `minimized_object_string_length` | `int` | No | Max string length in objects (default: `5,000`) |
| `saved_file_paths` | `dict[str, list[str]] \| None` | No | Mapping of artifact_id to saved file paths |
| `text_tip` | `str \| None` | No | Tip string for minimized text artifacts (default: `None`) |
| `data_tip` | `str \| None` | No | Tip string for minimized data artifacts (default: `None`) |

**Returns:** `list[`[`ArtifactForLLM`](#artifactforllm)`]`

```python
from a2a.types import Artifact, TextPart, DataPart, FilePart, FileWithBytes
from a2a_utils import minimize_artifacts

artifacts = [
    Artifact(
        artifactId="art-123",
        description="Full text of a research paper abstract spanning several pages.",
        name="Research Paper Abstract",
        parts=[TextPart(kind="text", text="x" * 60_000)],
    ),
    Artifact(
        artifactId="art-456",
        description="Company employee directory with names, departments, and salaries.",
        name="Employee Directory",
        parts=[DataPart(kind="data", data=[
            {
                "name": f"Employee {i}",
                "department": ["Eng", "Marketing", "Design", "Sales"][i % 4],
                "salary": 60_000 + i * 500,
            }
            for i in range(100)
        ])],
    ),
    Artifact(
        artifactId="art-789",
        description="Generated quarterly financial report in PDF format.",
        name="Quarterly Report",
        parts=[
            FilePart(
                kind="file",
                file=FileWithBytes(
                    name="q4-report.pdf",
                    mimeType="application/pdf",
                    bytes="base64encodeddata...",
                ),
            ),
        ],
    ),
]

minimized = minimize_artifacts(
    artifacts,
    text_tip="Text was minimized. Call view_text_artifact() to see specific line ranges.",
    data_tip="Data was minimized. Call view_data_artifact() to navigate to specific data.",
    saved_file_paths={"art-789": ["./storage/files/task-123/art-789/q4-report.pdf"]},
)
```

Example result:

```python
[
    ArtifactForLLM(
        artifact_id="art-123",
        description="Full text of a research paper abstract spanning several pages.",
        name="Research Paper Abstract",
        parts=[
            TextPartForLLM(
                kind="text",
                text="xxxxxxx...\n\n[... 10,000 characters omitted ...]\n\nxxxxxxx...",
            ),
        ],
    ),
    ArtifactForLLM(
        artifact_id="art-456",
        description="Company employee directory with names, departments, and salaries.",
        name="Employee Directory",
        parts=[
            DataPartForLLM(
                kind="data",
                data={
                    "data": {
                        "_total_rows": 100,
                        "_columns": ["..."],
                        "_tip": "Data was minimized. Call view_data_artifact() to navigate to specific data.",
                    }
                },
            ),
        ],
    ),
    ArtifactForLLM(
        artifact_id="art-789",
        description="Generated quarterly financial report in PDF format.",
        name="Quarterly Report",
        parts=[
            FilePartForLLM(
                kind="file",
                name="q4-report.pdf",
                mime_type="application/pdf",
                uri=None,
                bytes={"_saved_to": ["./storage/files/task-123/art-789/q4-report.pdf"]},
            ),
        ],
    ),
]
```

### 📋 Types

All types are frozen dataclasses exported from `a2a_utils`.

#### `AgentURLAndCustomHeaders`

Returned by `AgentManager.get_agent()` and `AgentManager.get_agents()`.

```python
AgentURLAndCustomHeaders(
    agent_card=AgentCard(
        name="Universal Translator",
        description="Translate text and audio between 50+ languages",
        url="https://translate.example.com",
        version="1.0.0",
        capabilities=AgentCapabilities(streaming=False, pushNotifications=False),
        skills=[
            AgentSkill(
                id="translate-text",
                name="Translate Text",
                description="Translate text between any supported language pair",
                tags=["translate", "text", "language"],
                examples=["Translate 'hello' to French"],
            ),
            AgentSkill(
                id="translate-audio",
                name="Translate Audio",
                description="Translate audio between any supported language pair",
                tags=["translate", "audio", "language"],
            )
        ],
        defaultInputModes=["text", "audio/mpeg"],
        defaultOutputModes=["text", "audio/mpeg"],
    ),
    custom_headers={"Authorization": "Bearer tok_123"},
)
```

| Field | Type |
|---|---|
| `agent_card` | `AgentCard` |
| `custom_headers` | `dict[str, str]` |

#### `TaskForLLM`

Returned by `A2ATools.send_message()` for task responses.

```python
TaskForLLM(
    id="task-123",
    context_id="ctx-456",
    kind="task",
    status=TaskStatusForLLM(
        state=TaskState.completed,
        message=MessageForLLM(
            context_id="ctx-456",
            kind="message",
            parts=[
                TextPartForLLM(
                    kind="text",
                    text="I found three recent papers on quantum computing and retrieved the abstract for the most recent one.",
                ),
            ],
        ),
    ),
    artifacts=[
        ArtifactForLLM(
            artifact_id="art-789",
            description="Search results for quantum computing papers",
            name="Search Results",
            parts=[
                DataPartForLLM(kind="data", data=[
                    {
                        "title": "Quantum Error Correction Advances",
                        "year": 2025,
                        "authors": "Chen et al.",
                    },
                    {
                        "title": "Topological Quantum Computing Survey",
                        "year": 2024,
                        "authors": "Nakamura et al.",
                    },
                    {
                        "title": "Fault-Tolerant Logical Qubits",
                        "year": 2024,
                        "authors": "Wang et al.",
                    },
                ]),
            ],
        ),
        ArtifactForLLM(
            artifact_id="art-790",
            description="Abstract of 'Quantum Error Correction Advances' by Chen et al.",
            name="Abstract",
            parts=[
                TextPartForLLM(
                    kind="text",
                    text="Quantum computing has seen rapid advances in error correction.\nRecent work demonstrates fault-tolerant logical qubits at scale.\nThis paper surveys progress in quantum error correction from 2023-2025.\nWe review surface codes, color codes, and novel hybrid approaches.\nKey results include a 10x reduction in logical error rates.\nThese improvements bring practical quantum computing closer to reality.\nWe also discuss remaining challenges in qubit connectivity.\nFinally, we outline a roadmap for achieving fault-tolerant quantum computation.",
                ),
            ],
        ),
    ],
)
```

| Field | Type |
|---|---|
| `id` | `str` |
| `context_id` | `str` |
| `kind` | `str` (`"task"`) |
| `status` | [`TaskStatusForLLM`](#taskstatusforllm) |
| `artifacts` | `list[`[`ArtifactForLLM`](#artifactforllm)`]` |

#### `MessageForLLM`

Returned by `A2ATools.send_message()` for message-only responses, or as `TaskStatusForLLM.message`.

```python
MessageForLLM(
    context_id="ctx-456",
    kind="message",
    parts=[
        TextPartForLLM(
            kind="text",
            text="I found three recent papers on quantum computing and retrieved the abstract for the most recent one.",
        ),
    ],
)
```

| Field | Type |
|---|---|
| `context_id` | `str \| None` |
| `kind` | `str` (`"message"`) |
| `parts` | `list[`[`TextPartForLLM`](#textpartforllm) `\|` [`DataPartForLLM`](#datapartforllm) `\|` [`FilePartForLLM`](#filepartforllm)`]` |

#### `TaskStatusForLLM`

```python
TaskStatusForLLM(
    state=TaskState.completed,
    message=MessageForLLM(
        context_id="ctx-456",
        kind="message",
        parts=[
            TextPartForLLM(
                kind="text",
                text="I found three recent papers on quantum computing and retrieved the abstract for the most recent one.",
            ),
        ],
    ),
)
```

| Field | Type |
|---|---|
| `state` | `TaskState` |
| `message` | [`MessageForLLM`](#messageforllm) `\| None` |

#### `ArtifactForLLM`

Returned by `view_text_artifact()`, `view_data_artifact()`, and `minimize_artifacts()`. Used in `TaskForLLM.artifacts`.

```python
ArtifactForLLM(
    artifact_id="art-790",
    description="Abstract of 'Quantum Error Correction Advances' by Chen et al.",
    name="Abstract",
    parts=[
        TextPartForLLM(
            kind="text",
            text="Quantum computing has seen rapid advances in error correction.\nRecent work demonstrates fault-tolerant logical qubits at scale.\nThis paper surveys progress in quantum error correction from 2023-2025.\nWe review surface codes, color codes, and novel hybrid approaches.\nKey results include a 10x reduction in logical error rates.\nThese improvements bring practical quantum computing closer to reality.\nWe also discuss remaining challenges in qubit connectivity.\nFinally, we outline a roadmap for achieving fault-tolerant quantum computation.",
        ),
    ],
)
```

| Field | Type |
|---|---|
| `artifact_id` | `str` |
| `description` | `str \| None` |
| `name` | `str \| None` |
| `parts` | `list[`[`TextPartForLLM`](#textpartforllm) `\|` [`DataPartForLLM`](#datapartforllm) `\|` [`FilePartForLLM`](#filepartforllm)`]` |

#### `TextPartForLLM`

```python
TextPartForLLM(
    kind="text",
    text="Quantum computing has seen rapid advances in error correction.\nRecent work demonstrates fault-tolerant logical qubits at scale.\nThis paper surveys progress in quantum error correction from 2023-2025.",
)
```

| Field | Type |
|---|---|
| `kind` | `str` (`"text"`) |
| `text` | `str` |

#### `DataPartForLLM`

```python
DataPartForLLM(kind="data", data=[
    {
        "title": "Quantum Error Correction Advances",
        "year": 2025,
        "authors": "Chen et al.",
    },
    {
        "title": "Topological Quantum Computing Survey",
        "year": 2024,
        "authors": "Nakamura et al.",
    },
    {
        "title": "Fault-Tolerant Logical Qubits",
        "year": 2024,
        "authors": "Wang et al.",
    },
])
```

| Field | Type |
|---|---|
| `kind` | `str` (`"data"`) |
| `data` | `Any` |

#### `FilePartForLLM`

Represents a file part in artifacts and messages. `uri` and `bytes` are mutually exclusive — at most one is set.

```python
FilePartForLLM(
    kind="file",
    name="q4-report.pdf",
    mime_type="application/pdf",
    uri=None,
    bytes={
        "_saved_to": [
            "./storage/files/task-123/art-789/q4-report.pdf",
        ],
    },
)
```

| Field | Type | Description |
|---|---|---|
| `kind` | `str` (`"file"`) | Always `"file"` |
| `name` | `str \| None` | Filename from the original FilePart |
| `mime_type` | `str \| None` | MIME type from the original FilePart |
| `uri` | `str \| dict[str, Any] \| None` | Raw URI (no FileStore) or `{"_saved_to": [...]}` (FileStore saved it) |
| `bytes` | `dict[str, Any] \| None` | `{"_saved_to": [...]}` (FileStore saved it) or `{"_error": "..."}` (no FileStore) |

## 📄 License

`a2a-utils` is distributed under the terms of the [Apache-2.0](https://spdx.org/licenses/Apache-2.0.html) license.

## 🤝 Join the A2A Net Community

A2A Net is a site to find and share AI agents and open-source community.

- 🌍 Site: [A2A Net](https://a2anet.com)
- 🤖 Discord: [Join the Discord](https://discord.gg/674NGXpAjU)

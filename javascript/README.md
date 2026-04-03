# A2A Utils JavaScript

[![npm version](https://img.shields.io/npm/v/@a2anet/a2a-utils.svg)](https://www.npmjs.com/package/@a2anet/a2a-utils) [![License](https://img.shields.io/github/license/a2anet/a2a-utils)](https://github.com/a2anet/a2a-utils/blob/main/LICENSE) [![A2A Protocol](https://img.shields.io/badge/A2A-Protocol-blue)](https://a2a-protocol.org) [![Discord](https://img.shields.io/discord/1391916121589944320?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/674NGXpAjU)

This package is a comprehensive set of utility functions for using [A2A servers (remote agents)](https://a2a-protocol.org/latest/topics/key-concepts/#core-actors-in-a2a-interactions), it powers the [A2A MCP Server](https://github.com/a2anet/a2a-mcp).

`A2ASession` is at the core of the package, it takes an `A2AAgents` (for connecting to agents, viewing Agent Cards, etc.), and optionally a `TaskStore` (for saving Tasks) and `FileStore` (for saving files).
It has two methods, `sendMessage` and `getTask`.

These methods are more sophisticated versions of the same methods in the [A2A SDKs](https://github.com/orgs/a2aproject/repositories).
For example, `sendMessage` abstracts retrieving Agent Cards, sending headers, etc., allowing you to send a message with an agent's ID, e.g. `sendMessage("research-bot", "Find recent papers on quantum computing")`.
It also sends the message as non-blocking and streams the response until the Task reaches a terminal state or times out.
If `sendMessage` times out, `getTask` can be called with the Task ID to start streaming the response again.
If `TaskStore` and `FileStore` are set, the Task, Artifacts, and files will automatically be saved.

`A2AAgents` stores user-defined agent IDs that link to Agent Card URLs and headers.
Agents are stored this way so that Agent Card URLs and headers are not exposed to the agent and because Agent Cards can be dynamic (i.e. change depending on the headers).
It has five methods, `getAgents`, `getAgentsForLlm`, `getAgent`, `getAgentForLlm`, and `addAgent`.
See the API reference below for more information.

Lastly, `A2ATools` is the most sophisticated class in the package, it takes an `A2ASession` and provides six LLM-friendly tools that can be used out-of-the-box with agent frameworks: `getAgents`, `getAgent`, `sendMessage`, `getTask`, `viewTextArtifact`, and `viewDataArtifact`.
The tools are based on [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents): they have LLM-friendly docstrings, return JSON-serialisable objects, and return actionable error messages.

Tool outputs are also optimised for LLMs.
For example, `getAgents` returns a list of agent names and descriptions, whereas `getAgent` also returns an agent's skill names and descriptions.
`sendMessage` and `getTask` return LLM-friendly types that are subsets of A2A types (e.g. `TaskForLLM`, `MessageForLLM`, and `ArtifactForLLM`) and automatically minimise large Artifacts, which can be viewed with `viewTextArtifact` and `viewDataArtifact`.

## ✨ Features

- **6 LLM-friendly tools** — `getAgents`, `getAgent`, `sendMessage`, `getTask`, `viewTextArtifact`, and `viewDataArtifact`, designed with clear docstrings, JSON-serialisable outputs, and actionable error messages
- **Simple message sending** — send messages with just an agent ID and message string; Agent Card fetching, headers, and non-blocking streaming are handled automatically
- **Multi-turn conversations** — continue conversations across multiple messages using `contextId`
- **Long-running task support** — if `sendMessage` times out, use `getTask` to resume streaming until the task reaches a terminal state
- **Automatic artifact minimization** — large text and data artifacts are automatically minimized for LLM context windows, with `viewTextArtifact` and `viewDataArtifact` for detailed navigation
- **Task persistence** — save and load tasks as JSON files with `JSONTaskStore`
- **File artifact storage** — save file artifacts to the local filesystem with `LocalFileStore`, or implement `FileStore` for custom backends (S3, GCS, etc.)
- **Agent Card management** — `A2AAgents` stores agent IDs, URLs, and custom headers, with multiple detail levels for LLM summaries (`name`, `basic`, `skills`, `full`)
- **Runtime agent registration** — add new agents at runtime with `addAgent`
- **Configurable timeouts and polling** — customisable timeouts for sending messages, monitoring tasks, and polling intervals

## 📦 Installation

To install with npm:

```bash
npm install @a2anet/a2a-utils
```

To install with bun:

```bash
bun add @a2anet/a2a-utils
```

## 🚀 Quick Start

Create an `A2ASession`, then `A2ATools` to get LLM-friendly tools that can be used out-of-the-box with agent frameworks.

```typescript
import { A2ATools, A2ASession, A2AAgents, JSONTaskStore, LocalFileStore } from "@a2anet/a2a-utils";
import { createAgent, tool } from "langchain";
import { ChatOpenAI } from "@langchain/openai";

const agents = new A2AAgents({
    weather: { url: "https://weather.example.com/.well-known/agent-card.json" },
    "research-bot": {
        url: "https://research.example.com/.well-known/agent-card.json",
        custom_headers: { "X-API-Key": "key_123" },
    },
});

const a2aSession = new A2ASession(agents, {
    taskStore: new JSONTaskStore("./storage/tasks"),
    fileStore: new LocalFileStore("./storage/files"),
});

const a2aTools = new A2ATools(a2aSession);

const langchainTools = a2aTools.toolDefinitions.map((def) =>
    tool(def.execute, { name: def.name, description: def.description, schema: def.schema }),
);

const model = new ChatOpenAI({ model: "gpt-5.1", reasoning: { effort: "medium" } });

const agent = createAgent({ model, tools: langchainTools });
```

## 📖 API Reference

### A2ATools

Ready-made tools for agents to communicate with A2A servers. Each tool is an instance property with `name`, `description`, `schema` (Zod), and `execute`. Use the `toolDefinitions` getter for the full array.

```typescript
import { A2ATools, A2ASession, A2AAgents } from "@a2anet/a2a-utils";

const tools = new A2ATools(session);
```

| Parameter          | Type                       | Required | Description                                                    |
| ------------------ | -------------------------- | -------- | -------------------------------------------------------------- |
| `session`          | `A2ASession`               | Yes      | The session instance for sending messages and managing agents  |
| `artifactSettings` | `ArtifactSettings \| null` | No       | Minimization/view settings (default: `new ArtifactSettings()`) |

`artifactSettings` determines how Artifacts are minimized and viewed:

```typescript
import { ArtifactSettings } from "@a2anet/a2a-utils";

const settings = new ArtifactSettings({
    sendMessageCharacterLimit: 100_000,
    minimizedObjectStringLength: 10_000,
    viewArtifactCharacterLimit: 100_000,
});
const tools = new A2ATools(session, { artifactSettings: settings });
```

| Field                         | Type     | Default  | Description                                                             |
| ----------------------------- | -------- | -------- | ----------------------------------------------------------------------- |
| `sendMessageCharacterLimit`   | `number` | `50,000` | Character limit above which artifacts are minimized in `sendMessage`    |
| `minimizedObjectStringLength` | `number` | `5,000`  | Max length for individual string values within minimized data objects   |
| `viewArtifactCharacterLimit`  | `number` | `50,000` | Character limit for output from `viewTextArtifact` / `viewDataArtifact` |

#### `getAgents`

List all available agents with their names and descriptions.

```typescript
const result = await tools.getAgents.execute({});
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

#### `getAgent`

Get detailed information about a specific agent, including its skills.

```typescript
const result = await tools.getAgent.execute({ agentId: "research-bot" });
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

#### `sendMessage`

Send a message to an agent and receive a structured response. The response includes the agent's reply and any generated Artifacts. Artifacts are automatically minimized to fit the context window.

| Parameter   | Type        | Required | Description                                                   |
| ----------- | ----------- | -------- | ------------------------------------------------------------- |
| `agentId`   | `string`    | Yes      | ID of the agent to message (from get_agents)                  |
| `message`   | `string`    | Yes      | The message content to send                                   |
| `contextId` | `string`    | No       | Continue an existing conversation by providing its context ID |
| `taskId`    | `string`    | No       | Attach to an existing task (for input_required flows)         |
| `timeout`   | `number`    | No       | Override the default timeout in seconds                       |
| `data`      | `unknown[]` | No       | Structured data to include with the message                   |
| `files`     | `string[]`  | No       | Files to include (local paths or URLs)                        |

```typescript
const result = await tools.sendMessage.execute({
    agentId: "research-bot",
    message: "Find recent papers on quantum computing",
});
```

Example result:

```json
{
    "id": "task-123",
    "contextId": "ctx-456",
    "kind": "task",
    "status": {
        "state": "completed",
        "message": "I found three recent papers on quantum computing and retrieved the abstract for the most recent one."
    },
    "artifacts": [
        {
            "artifactId": "art-789",
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
            "artifactId": "art-790",
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

Continue the conversation using `contextId`:

```typescript
const result2 = await tools.sendMessage.execute({
    agentId: "research-bot",
    message: "Summarize the most recent result",
    contextId: "ctx-456",
});
```

#### `getTask`

Check the progress of a task that is still in progress. Use this after `sendMessage` returns a task in a non-terminal state (e.g. `"working"`).

| Parameter      | Type     | Required | Description                                            |
| -------------- | -------- | -------- | ------------------------------------------------------ |
| `agentId`      | `string` | Yes      | ID of the agent that owns the task                     |
| `taskId`       | `string` | Yes      | Task ID from a previous send_message response          |
| `timeout`      | `number` | No       | Override the monitoring timeout in seconds             |
| `pollInterval` | `number` | No       | Override the interval between status checks in seconds |

```typescript
const result = await tools.getTask.execute({
    agentId: "research-bot",
    taskId: "task-123",
});
```

#### `viewTextArtifact`

View text content from an artifact, optionally selecting a range. Use this for artifacts containing text (documents, logs, code, etc.).

| Parameter        | Type     | Required | Description                                   |
| ---------------- | -------- | -------- | --------------------------------------------- |
| `agentId`        | `string` | Yes      | ID of the agent that produced the artifact    |
| `taskId`         | `string` | Yes      | Task ID containing the artifact               |
| `artifactId`     | `string` | Yes      | The artifact's unique identifier              |
| `lineStart`      | `number` | No       | Starting line number (1-based, inclusive)     |
| `lineEnd`        | `number` | No       | Ending line number (1-based, inclusive)       |
| `characterStart` | `number` | No       | Starting character index (0-based, inclusive) |
| `characterEnd`   | `number` | No       | Ending character index (0-based, exclusive)   |

```typescript
const result = await tools.viewTextArtifact.execute({
    agentId: "research-bot",
    taskId: "task-123",
    artifactId: "art-790",
    lineStart: 1,
    lineEnd: 3,
});
```

Example result:

```json
{
    "artifactId": "art-790",
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

#### `viewDataArtifact`

View structured data from an artifact with optional filtering. Use this for artifacts containing JSON data (objects, arrays, tables).

| Parameter    | Type     | Required | Description                                                           |
| ------------ | -------- | -------- | --------------------------------------------------------------------- |
| `agentId`    | `string` | Yes      | ID of the agent that produced the artifact                            |
| `taskId`     | `string` | Yes      | Task ID containing the artifact                                       |
| `artifactId` | `string` | Yes      | The artifact's unique identifier                                      |
| `jsonPath`   | `string` | No       | Dot-separated path to navigate into the data (e.g. `"results.items"`) |
| `rows`       | `string` | No       | Row selection: `"0"`, `"0-10"`, `"0,2,5"`, `"all"`                    |
| `columns`    | `string` | No       | Column selection: `"name"`, `"name,age"`, `"all"`                     |

```typescript
const result = await tools.viewDataArtifact.execute({
    agentId: "research-bot",
    taskId: "task-123",
    artifactId: "art-789",
    rows: "0-1",
    columns: "title,year",
});
```

Example result:

```json
{
    "artifactId": "art-789",
    "description": "Search results for quantum computing papers",
    "name": "Search Results",
    "parts": [
        {
            "kind": "data",
            "data": [
                { "title": "Quantum Error Correction Advances", "year": 2025 },
                { "title": "Topological Quantum Computing Survey", "year": 2024 }
            ]
        }
    ]
}
```

### A2ASession

Programmatic interface for sending messages to A2A agents. Returns full A2A SDK types (`Task`, `Message`) for direct use.

```typescript
import { A2ASession, A2AAgents, JSONTaskStore, LocalFileStore } from "@a2anet/a2a-utils";

const session = new A2ASession(
    new A2AAgents({
        "research-bot": { url: "https://research-bot.example.com/.well-known/agent-card.json" },
    }),
    {
        taskStore: new JSONTaskStore("./storage/tasks"),
        fileStore: new LocalFileStore("./storage/files"),
    },
);
```

| Parameter             | Type                     | Required | Description                                                         |
| --------------------- | ------------------------ | -------- | ------------------------------------------------------------------- |
| `agents`              | `A2AAgents`              | Yes      | The agent manager instance                                          |
| `taskStore`           | `TaskStore \| undefined` | No       | Task store for persistence (default: `InMemoryTaskStore`)           |
| `fileStore`           | `FileStore \| null`      | No       | File store for saving file artifacts (default: `null`)              |
| `sendMessageTimeout`  | `number`                 | No       | HTTP timeout in seconds for `sendMessage` (default: `60.0`)         |
| `getTaskTimeout`      | `number`                 | No       | Total monitoring timeout in seconds for `getTask` (default: `60.0`) |
| `getTaskPollInterval` | `number`                 | No       | Interval in seconds between `getTask` polls (default: `5.0`)        |

#### `async sendMessage(agentId: string, message: string, opts?): Promise<Task | Message>`

Send a message to an A2A agent. The returned task is automatically saved to the task store. File artifacts are saved via the file store.

| Parameter        | Type             | Required | Description                                                      |
| ---------------- | ---------------- | -------- | ---------------------------------------------------------------- |
| `agentId`        | `string`         | Yes      | Registered agent identifier                                      |
| `message`        | `string`         | Yes      | The message content to send                                      |
| `opts.contextId` | `string \| null` | No       | Context ID to continue a conversation (auto-generated when null) |
| `opts.taskId`    | `string \| null` | No       | Task ID to attach to the message                                 |
| `opts.timeout`   | `number \| null` | No       | Override HTTP timeout in seconds (default: `sendMessageTimeout`) |

```typescript
import type { Task, Message } from "@a2a-js/sdk";

const response = await session.sendMessage(
    "research-bot",
    "Find recent papers on quantum computing",
);
```

Continue the conversation using `contextId`:

```typescript
const response2 = await session.sendMessage("research-bot", "Summarize the most recent result", {
    contextId: response.contextId,
});
```

**Returns:** `Task | Message` (from `@a2a-js/sdk`)

#### `async getTask(agentId: string, taskId: string, opts?): Promise<Task>`

Get the current state of a task. Monitors until a terminal state (`completed`, `canceled`, `failed`, `rejected`) or actionable state (`input-required`, `auth-required`) is reached, or until timeout. Uses SSE resubscription if the agent supports streaming, otherwise polls at regular intervals.

On monitoring timeout, returns the current task state (which may still be non-terminal, e.g. `working`). The only errors from `getTask` are failed HTTP requests (agent down, network error).

| Parameter           | Type             | Required | Description                                                                 |
| ------------------- | ---------------- | -------- | --------------------------------------------------------------------------- |
| `agentId`           | `string`         | Yes      | Registered agent identifier                                                 |
| `taskId`            | `string`         | Yes      | Task ID from a previous `sendMessage` call                                  |
| `opts.timeout`      | `number \| null` | No       | Override monitoring timeout in seconds (default: `getTaskTimeout`)          |
| `opts.pollInterval` | `number \| null` | No       | Override interval between polls in seconds (default: `getTaskPollInterval`) |

```typescript
const task = await session.getTask("research-bot", "task-123");
```

**Returns:** `Task` (from `@a2a-js/sdk`)

### A2AAgents

Manages A2A agent cards keyed by user-defined agent IDs.

```typescript
import { A2AAgents } from "@a2anet/a2a-utils";

// From object
const manager = new A2AAgents({
    "language-translator": {
        url: "https://example.com/language-translator/agent-card.json",
        custom_headers: { Authorization: "Bearer tok_123" },
    },
});

// From JSON file
const manager2 = new A2AAgents("./agents.json");

// Empty — add agents later
const manager3 = new A2AAgents();
```

#### `async getAgents(): Promise<Record<string, AgentURLAndCustomHeaders>>`

Get all registered agents.
Note: this should NOT be added to the LLM's context, use `getAgentsForLlm` instead.

**Returns:** `Record<string, AgentURLAndCustomHeaders>`

```typescript
const agents = await manager.getAgents();
```

#### `async getAgentsForLlm(detail?: string): Promise<Record<string, Record<string, unknown>>>`

Generate summary of all agents, sorted by agent_id.

| Parameter | Type     | Required | Description                                                          |
| --------- | -------- | -------- | -------------------------------------------------------------------- |
| `detail`  | `string` | No       | Detail level: `"name"`, `"basic"` (default), `"skills"`, or `"full"` |

**Returns:** `Record<string, Record<string, unknown>>`

`"name"`:

```typescript
const summaries = await manager.getAgentsForLlm("name");
```

```json
{
    "code-reviewer": { "name": "Code Reviewer" },
    "language-translator": { "name": "Universal Translator" }
}
```

`"basic"` (default):

```typescript
const summaries = await manager.getAgentsForLlm();
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

```typescript
const summaries = await manager.getAgentsForLlm("skills");
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

```typescript
const summaries = await manager.getAgentsForLlm("full");
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

#### `async getAgent(agentId: string): Promise<AgentURLAndCustomHeaders | null>`

Retrieve agent by ID.
Note: this should NOT be added to the LLM's context, use `getAgentForLlm` instead.

| Parameter | Type     | Required | Description                   |
| --------- | -------- | -------- | ----------------------------- |
| `agentId` | `string` | Yes      | User-defined agent identifier |

**Returns:** [`AgentURLAndCustomHeaders`](#agenturlandcustomheaders) | `null`

```typescript
const agent = await manager.getAgent("language-translator");
```

Returns `null` if the agent ID is not registered.

#### `async getAgentForLlm(agentId: string, detail?: string): Promise<Record<string, unknown> | null>`

Generate summary for a single agent.

| Parameter | Type     | Required | Description                                                          |
| --------- | -------- | -------- | -------------------------------------------------------------------- |
| `agentId` | `string` | Yes      | User-defined agent identifier                                        |
| `detail`  | `string` | No       | Detail level: `"name"`, `"basic"` (default), `"skills"`, or `"full"` |

**Returns:** `Record<string, unknown> | null` — summary object or `null` if not found.

```typescript
const summary = await manager.getAgentForLlm("language-translator");
```

```json
{
    "name": "Universal Translator",
    "description": "Translate text and audio between 50+ languages"
}
```

#### `async addAgent(agentId: string, url: string, customHeaders?: Record<string, string>): Promise<void>`

Register a new agent at runtime.

| Parameter       | Type                     | Required | Description                   |
| --------------- | ------------------------ | -------- | ----------------------------- |
| `agentId`       | `string`                 | Yes      | User-defined agent identifier |
| `url`           | `string`                 | Yes      | Agent card URL                |
| `customHeaders` | `Record<string, string>` | No       | Custom HTTP headers           |

**Throws:** `Error` if `agentId` is already registered.

```typescript
await manager.addAgent("code-reviewer", "https://review.example.com/.well-known/agent-card.json", {
    "X-API-Key": "key_123",
});
```

### 💾 JSONTaskStore

Persists Task objects as individual JSON files. Implements the A2A SDK `TaskStore` interface.

```typescript
import { JSONTaskStore } from "@a2anet/a2a-utils";

const taskStore = new JSONTaskStore("./storage/tasks");
```

#### `async save(task: Task): Promise<void>`

Save a task to disk. Creates `./storage/tasks/{task_id}.json`.

#### `async load(taskId: string): Promise<Task | undefined>`

Load a task from disk.

Returns `undefined` if the task file does not exist.

#### `async delete(taskId: string): Promise<void>`

Delete a task from disk.

### 📁 Files

#### FileStore

Interface for file storage. Implement this to use custom storage backends (S3, GCS, etc.).

```typescript
import type { Artifact } from "@a2a-js/sdk";

interface FileStore {
    save(taskId: string, artifact: Artifact): Promise<string[]>;
    get(taskId: string, artifactId: string): Promise<string[]>;
    delete(taskId: string, artifactId: string): Promise<void>;
}
```

#### LocalFileStore

Saves artifact file parts to the local filesystem. Files are stored at `storageDir/taskId/artifactId/filename`.

```typescript
import { LocalFileStore } from "@a2anet/a2a-utils";

const fileStore = new LocalFileStore("./storage/files");
```

##### `async save(taskId: string, artifact: Artifact): Promise<string[]>`

Save file parts from an artifact to disk.

```typescript
const savedPaths = await fileStore.save("task-123", artifact);
```

Example result:

```typescript
["./storage/files/task-123/art-789/quarterly_report.pdf"];
```

##### `async get(taskId: string, artifactId: string): Promise<string[]>`

Get saved file paths for an artifact.

```typescript
const paths = await fileStore.get("task-123", "art-789");
```

Example result:

```typescript
["./storage/files/task-123/art-789/quarterly_report.pdf"];
```

Returns an empty array if no files are found.

##### `async delete(taskId: string, artifactId: string): Promise<void>`

Delete saved files for an artifact.

```typescript
await fileStore.delete("task-123", "art-789");
```

### 🎨 Artifacts

`A2ATools` uses the `TextArtifacts` and `DataArtifacts` classes to automatically minimize Artifacts returned from `sendMessage` and view Artifacts using `viewTextArtifact` and `viewDataArtifact`. They can also be used independently on raw data.

#### TextArtifacts

##### `TextArtifacts.view(text, opts?): string`

View text content with optional line or character range selection. Supports line selection (1-based, inclusive) or character selection (0-based, slice semantics). These are mutually exclusive — providing both throws an `Error`.

| Parameter             | Type             | Required | Description                                   |
| --------------------- | ---------------- | -------- | --------------------------------------------- |
| `text`                | `string`         | Yes      | The text to view                              |
| `opts.lineStart`      | `number \| null` | No       | Starting line number (1-based, inclusive)     |
| `opts.lineEnd`        | `number \| null` | No       | Ending line number (1-based, inclusive)       |
| `opts.characterStart` | `number \| null` | No       | Starting character index (0-based, inclusive) |
| `opts.characterEnd`   | `number \| null` | No       | Ending character index (0-based, exclusive)   |
| `opts.characterLimit` | `number`         | No       | Maximum output size (default: `50,000`)       |

**Returns:** `string`

Line selection:

```typescript
import { TextArtifacts } from "@a2anet/a2a-utils";

const text = "[INFO] Server started\n[INFO] Connected to DB\n[WARN] Cache miss\n[INFO] Request OK";
TextArtifacts.view(text, { lineStart: 1, lineEnd: 2 });
```

Example result:

```
"[INFO] Server started\n[INFO] Connected to DB"
```

Character selection:

```typescript
TextArtifacts.view("Hello, World!", { characterStart: 0, characterEnd: 5 });
```

Example result:

```
"Hello"
```

##### `TextArtifacts.minimize(text, opts?): Record<string, unknown>`

Minimize text content for display. If text is within the character limit, returns it unchanged. If over the limit, shows first and last halves with metadata.

| Parameter             | Type             | Required | Description                                                |
| --------------------- | ---------------- | -------- | ---------------------------------------------------------- |
| `text`                | `string`         | Yes      | The text content to minimize                               |
| `opts.characterLimit` | `number`         | No       | Character limit (default: `50,000`)                        |
| `opts.tip`            | `string \| null` | No       | Tip string (default: `null`; pass a string to include one) |

**Returns:** `Record<string, unknown>`

Short text (under limit):

```typescript
import { TextArtifacts } from "@a2anet/a2a-utils";

TextArtifacts.minimize("Hello, world!");
```

```json
{ "text": "Hello, world!" }
```

Long text (over limit):

```typescript
TextArtifacts.minimize("x".repeat(60_000));
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

##### `DataArtifacts.view(data, opts?): unknown`

View structured data with optional filtering. Navigate with `jsonPath`, then filter with `rows`/`columns`.

| Parameter             | Type                                   | Required | Description                                   |
| --------------------- | -------------------------------------- | -------- | --------------------------------------------- |
| `data`                | `unknown`                              | Yes      | The data to view                              |
| `opts.jsonPath`       | `string \| null`                       | No       | Dot-separated path to extract specific fields |
| `opts.rows`           | `number \| number[] \| string \| null` | No       | Row selection                                 |
| `opts.columns`        | `string \| string[] \| null`           | No       | Column selection                              |
| `opts.characterLimit` | `number`                               | No       | Maximum output size (default: `50,000`)       |

**Returns:** `unknown` (filtered data)

```typescript
import { DataArtifacts } from "@a2anet/a2a-utils";

const data = {
    employees: [
        { name: "Alice", department: "Engineering", level: 5 },
        { name: "Bob", department: "Design", level: 3 },
        { name: "Carol", department: "Engineering", level: 4 },
    ],
};

DataArtifacts.view(data, { jsonPath: "employees", rows: "0-2", columns: ["name", "department"] });
```

Example result:

```json
[
    { "name": "Alice", "department": "Engineering" },
    { "name": "Bob", "department": "Design" }
]
```

##### `DataArtifacts.minimize(data, opts?): Record<string, unknown>`

Minimize data content for display based on type. Automatically selects the best strategy: list-of-objects gets a table summary, dicts get string truncation, strings delegate to `TextArtifacts.minimize`.

| Parameter                          | Type             | Required | Description                                                |
| ---------------------------------- | ---------------- | -------- | ---------------------------------------------------------- |
| `data`                             | `unknown`        | Yes      | The data to minimize                                       |
| `opts.characterLimit`              | `number`         | No       | Character limit (default: `50,000`)                        |
| `opts.minimizedObjectStringLength` | `number`         | No       | Max string length in objects (default: `5,000`)            |
| `opts.tip`                         | `string \| null` | No       | Tip string (default: `null`; pass a string to include one) |

**Returns:** `Record<string, unknown>`

Lists of objects are summarized as table summaries (see `summarizeTable`) and lists of values as value summaries (see `summarizeValues`).

```typescript
import { DataArtifacts } from "@a2anet/a2a-utils";

const data = {
    title: "Quarterly Report Q4 2025",
    summary: "x".repeat(10_000),
    metrics: { revenue: 1_250_000, growth: 12.5 },
    employees: Array.from({ length: 100 }, (_, i) => ({
        name: `Employee ${i}`,
        department: ["Eng", "Marketing", "Design", "Sales"][i % 4],
        salary: 60_000 + i * 500,
    })),
    tags: ["finance", "quarterly", "internal"],
};

DataArtifacts.minimize(data, { characterLimit: 100, minimizedObjectStringLength: 10 });
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
            ],
            "_json_path": "employees"
        },
        "tags": ["finance", "quarterly", "internal"]
    }
}
```

##### `DataArtifacts.summarizeTable(data): Record<string, unknown>[]`

Generate a summary of tabular data (array of objects). Returns one summary object per column with count, unique count, and per-type statistics.

| Parameter | Type                        | Required | Description |
| --------- | --------------------------- | -------- | ----------- |
| `data`    | `Record<string, unknown>[]` | Yes      | Table rows  |

**Returns:** `Record<string, unknown>[]`

```typescript
import { DataArtifacts } from "@a2anet/a2a-utils";

const data = Array.from({ length: 100 }, (_, i) => ({
    name: `Employee ${i}`,
    department: ["Eng", "Marketing", "Design", "Sales"][i % 4],
    salary: 60_000 + i * 500,
}));

DataArtifacts.summarizeTable(data);
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

##### `DataArtifacts.summarizeValues(values): Record<string, unknown> | unknown[]`

Generate statistics for a list of values (like a single column). Includes count, unique count, and per-type statistics (min/max/avg/stdev for numbers, length stats for strings, etc.). If the summary would be larger than the original values, the original list is returned instead (inflation guard).

| Parameter | Type        | Required | Description         |
| --------- | ----------- | -------- | ------------------- |
| `values`  | `unknown[]` | Yes      | Values to summarize |

**Returns:** `Record<string, unknown> | unknown[]`

```typescript
import { DataArtifacts } from "@a2anet/a2a-utils";

const salaries = [
    95000,
    72000,
    105000,
    68000,
    88000,
    // ... ~100 salary values total, with some nulls
    null,
    115000,
    92000,
    null,
    78000,
];

DataArtifacts.summarizeValues(salaries);
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

#### `minimizeArtifacts(artifacts, opts?): ArtifactForLLM[]`

Minimize a list of artifacts for LLM display. Called automatically by `A2ATools.sendMessage`. Combines all TextParts within each artifact into a single [`TextPartForLLM`](#textpartforllm). Handles `FilePart`s by including file metadata and saved paths.

| Parameter                          | Type                               | Required | Description                                               |
| ---------------------------------- | ---------------------------------- | -------- | --------------------------------------------------------- |
| `artifacts`                        | `Artifact[]`                       | Yes      | List of artifacts to minimize                             |
| `opts.characterLimit`              | `number`                           | No       | Character limit (default: `50,000`)                       |
| `opts.minimizedObjectStringLength` | `number`                           | No       | Max string length in objects (default: `5,000`)           |
| `opts.savedFilePaths`              | `Record<string, string[]> \| null` | No       | Mapping of artifactId to saved file paths                 |
| `opts.textTip`                     | `string \| null`                   | No       | Tip string for minimized text artifacts (default: `null`) |
| `opts.dataTip`                     | `string \| null`                   | No       | Tip string for minimized data artifacts (default: `null`) |

**Returns:** [`ArtifactForLLM`](#artifactforllm)`[]`

```typescript
import type { Artifact } from "@a2a-js/sdk";
import { minimizeArtifacts } from "@a2anet/a2a-utils";

const artifacts: Artifact[] = [
    {
        artifactId: "art-123",
        description: "Full text of a research paper abstract spanning several pages.",
        name: "Research Paper Abstract",
        parts: [{ kind: "text", text: "x".repeat(60_000) }],
    },
    {
        artifactId: "art-456",
        description: "Company employee directory with names, departments, and salaries.",
        name: "Employee Directory",
        parts: [
            {
                kind: "data",
                data: Array.from({ length: 100 }, (_, i) => ({
                    name: `Employee ${i}`,
                    department: ["Eng", "Marketing", "Design", "Sales"][i % 4],
                    salary: 60_000 + i * 500,
                })),
            },
        ],
    },
    {
        artifactId: "art-789",
        description: "Generated quarterly financial report in PDF format.",
        name: "Quarterly Report",
        parts: [
            {
                kind: "file",
                file: {
                    name: "q4-report.pdf",
                    mimeType: "application/pdf",
                    bytes: "base64encodeddata...",
                },
            },
        ],
    },
];

const minimized = minimizeArtifacts(artifacts, {
    textTip: "Text was minimized. Call viewTextArtifact() to see specific line ranges.",
    dataTip: "Data was minimized. Call viewDataArtifact() to navigate to specific data.",
    savedFilePaths: { "art-789": ["./storage/files/task-123/art-789/q4-report.pdf"] },
});
```

Example result:

```json
[
    {
        "artifactId": "art-123",
        "description": "Full text of a research paper abstract spanning several pages.",
        "name": "Research Paper Abstract",
        "parts": [
            {
                "kind": "text",
                "text": "xxxxxxx...\n\n[... 10,000 characters omitted ...]\n\nxxxxxxx..."
            }
        ]
    },
    {
        "artifactId": "art-456",
        "description": "Company employee directory with names, departments, and salaries.",
        "name": "Employee Directory",
        "parts": [
            {
                "kind": "data",
                "data": {
                    "data": {
                        "_total_rows": 100,
                        "_columns": ["..."],
                        "_tip": "Data was minimized. Call viewDataArtifact() to navigate to specific data."
                    }
                }
            }
        ]
    },
    {
        "artifactId": "art-789",
        "description": "Generated quarterly financial report in PDF format.",
        "name": "Quarterly Report",
        "parts": [
            {
                "kind": "file",
                "name": "q4-report.pdf",
                "mimeType": "application/pdf",
                "uri": null,
                "bytes": {
                    "_saved_to": ["./storage/files/task-123/art-789/q4-report.pdf"]
                }
            }
        ]
    }
]
```

### 📋 Types

All types are readonly interfaces exported from `@a2anet/a2a-utils`.

#### `AgentURLAndCustomHeaders`

Returned by `A2AAgents.getAgent()` and `A2AAgents.getAgents()`.

```typescript
const agent: AgentURLAndCustomHeaders = {
    agentCard: {
        name: "Universal Translator",
        description: "Translate text and audio between 50+ languages",
        url: "https://translate.example.com",
        version: "1.0.0",
        capabilities: { streaming: false, pushNotifications: false },
        skills: [
            {
                id: "translate-text",
                name: "Translate Text",
                description: "Translate text between any supported language pair",
                tags: ["translate", "text", "language"],
                examples: ["Translate 'hello' to French"],
            },
            {
                id: "translate-audio",
                name: "Translate Audio",
                description: "Translate audio between any supported language pair",
                tags: ["translate", "audio", "language"],
            },
        ],
        defaultInputModes: ["text", "audio/mpeg"],
        defaultOutputModes: ["text", "audio/mpeg"],
    },
    customHeaders: { Authorization: "Bearer tok_123" },
};
```

| Field           | Type                     |
| --------------- | ------------------------ |
| `agentCard`     | `AgentCard`              |
| `customHeaders` | `Record<string, string>` |

#### `TaskForLLM`

Returned by `A2ATools.sendMessage.execute()` for task responses.

```typescript
const task: TaskForLLM = {
    id: "task-123",
    contextId: "ctx-456",
    kind: "task",
    status: {
        state: "completed",
        message: {
            contextId: "ctx-456",
            kind: "message",
            parts: [
                {
                    kind: "text",
                    text: "I found three recent papers on quantum computing and retrieved the abstract for the most recent one.",
                },
            ],
        },
    },
    artifacts: [
        {
            artifactId: "art-789",
            description: "Search results for quantum computing papers",
            name: "Search Results",
            parts: [
                {
                    kind: "data",
                    data: [
                        {
                            title: "Quantum Error Correction Advances",
                            year: 2025,
                            authors: "Chen et al.",
                        },
                        {
                            title: "Topological Quantum Computing Survey",
                            year: 2024,
                            authors: "Nakamura et al.",
                        },
                        {
                            title: "Fault-Tolerant Logical Qubits",
                            year: 2024,
                            authors: "Wang et al.",
                        },
                    ],
                },
            ],
        },
        {
            artifactId: "art-790",
            description: "Abstract of 'Quantum Error Correction Advances' by Chen et al.",
            name: "Abstract",
            parts: [
                {
                    kind: "text",
                    text: "Quantum computing has seen rapid advances in error correction.\nRecent work demonstrates fault-tolerant logical qubits at scale.\nThis paper surveys progress in quantum error correction from 2023-2025.\nWe review surface codes, color codes, and novel hybrid approaches.\nKey results include a 10x reduction in logical error rates.\nThese improvements bring practical quantum computing closer to reality.\nWe also discuss remaining challenges in qubit connectivity.\nFinally, we outline a roadmap for achieving fault-tolerant quantum computation.",
                },
            ],
        },
    ],
};
```

| Field       | Type                                    |
| ----------- | --------------------------------------- |
| `id`        | `string`                                |
| `contextId` | `string`                                |
| `kind`      | `string` (`"task"`)                     |
| `status`    | [`TaskStatusForLLM`](#taskstatusforllm) |
| `artifacts` | [`ArtifactForLLM`](#artifactforllm)`[]` |

#### `MessageForLLM`

Returned by `A2ATools.sendMessage.execute()` for message-only responses, or as `TaskStatusForLLM.message`.

```typescript
const message: MessageForLLM = {
    contextId: "ctx-456",
    kind: "message",
    parts: [
        {
            kind: "text",
            text: "I found three recent papers on quantum computing and retrieved the abstract for the most recent one.",
        },
    ],
};
```

| Field       | Type                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `contextId` | `string \| null`                                                                                                      |
| `kind`      | `string` (`"message"`)                                                                                                |
| `parts`     | ([`TextPartForLLM`](#textpartforllm) \| [`DataPartForLLM`](#datapartforllm) \| [`FilePartForLLM`](#filepartforllm))[] |

#### `TaskStatusForLLM`

```typescript
const taskStatus: TaskStatusForLLM = {
    state: "completed",
    message: {
        contextId: "ctx-456",
        kind: "message",
        parts: [
            {
                kind: "text",
                text: "I found three recent papers on quantum computing and retrieved the abstract for the most recent one.",
            },
        ],
    },
};
```

| Field     | Type                                        |
| --------- | ------------------------------------------- |
| `state`   | `TaskState`                                 |
| `message` | [`MessageForLLM`](#messageforllm) `\| null` |

#### `ArtifactForLLM`

Returned by `viewTextArtifact.execute()`, `viewDataArtifact.execute()`, and `minimizeArtifacts()`. Used in `TaskForLLM.artifacts`.

```typescript
const artifact: ArtifactForLLM = {
    artifactId: "art-790",
    description: "Abstract of 'Quantum Error Correction Advances' by Chen et al.",
    name: "Abstract",
    parts: [
        {
            kind: "text",
            text: "Quantum computing has seen rapid advances in error correction.\nRecent work demonstrates fault-tolerant logical qubits at scale.\nThis paper surveys progress in quantum error correction from 2023-2025.\nWe review surface codes, color codes, and novel hybrid approaches.\nKey results include a 10x reduction in logical error rates.\nThese improvements bring practical quantum computing closer to reality.\nWe also discuss remaining challenges in qubit connectivity.\nFinally, we outline a roadmap for achieving fault-tolerant quantum computation.",
        },
    ],
};
```

| Field         | Type                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| `artifactId`  | `string`                                                                                                              |
| `description` | `string \| null`                                                                                                      |
| `name`        | `string \| null`                                                                                                      |
| `parts`       | ([`TextPartForLLM`](#textpartforllm) \| [`DataPartForLLM`](#datapartforllm) \| [`FilePartForLLM`](#filepartforllm))[] |

#### `TextPartForLLM`

```typescript
const textPart: TextPartForLLM = {
    kind: "text",
    text: "Quantum computing has seen rapid advances in error correction.\nRecent work demonstrates fault-tolerant logical qubits at scale.\nThis paper surveys progress in quantum error correction from 2023-2025.",
};
```

| Field  | Type                |
| ------ | ------------------- |
| `kind` | `string` (`"text"`) |
| `text` | `string`            |

#### `DataPartForLLM`

```typescript
const dataPart: DataPartForLLM = {
    kind: "data",
    data: [
        {
            title: "Quantum Error Correction Advances",
            year: 2025,
            authors: "Chen et al.",
        },
        {
            title: "Topological Quantum Computing Survey",
            year: 2024,
            authors: "Nakamura et al.",
        },
        {
            title: "Fault-Tolerant Logical Qubits",
            year: 2024,
            authors: "Wang et al.",
        },
    ],
};
```

| Field  | Type                |
| ------ | ------------------- |
| `kind` | `string` (`"data"`) |
| `data` | `unknown`           |

#### `FilePartForLLM`

Represents a file part in artifacts and messages. `uri` and `bytes` are mutually exclusive — at most one is set.

```typescript
const filePart: FilePartForLLM = {
    kind: "file",
    name: "q4-report.pdf",
    mimeType: "application/pdf",
    uri: null,
    bytes: {
        _saved_to: ["./storage/files/task-123/art-789/q4-report.pdf"],
    },
};
```

| Field      | Type                                        | Description                                                                       |
| ---------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| `kind`     | `string` (`"file"`)                         | Always `"file"`                                                                   |
| `name`     | `string \| null`                            | Filename from the original FilePart                                               |
| `mimeType` | `string \| null`                            | MIME type from the original FilePart                                              |
| `uri`      | `string \| Record<string, unknown> \| null` | Raw URI (no FileStore) or `{"_saved_to": [...]}` (FileStore saved it)             |
| `bytes`    | `Record<string, unknown> \| null`           | `{"_saved_to": [...]}` (FileStore saved it) or `{"_error": "..."}` (no FileStore) |

## 📄 License

`@a2anet/a2a-utils` is distributed under the terms of the [Apache-2.0](https://spdx.org/licenses/Apache-2.0.html) license.

## 🤝 Join the A2A Net Community

A2A Net is a site to find and share AI agents and open-source community.

- 🌍 Site: [A2A Net](https://a2anet.com)
- 🤖 Discord: [Join the Discord](https://discord.gg/674NGXpAjU)

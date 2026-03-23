# Cross-Reference: Python ↔ TypeScript

A living document mapping every Python module, class, and method to its TypeScript counterpart, so changes can be applied to both packages simultaneously.

## 1. File Mapping

| Python | TypeScript |
|--------|-----------|
| `src/a2a_utils/__about__.py` | `src/index.ts` (VERSION constant) |
| `src/a2a_utils/__init__.py` | `src/index.ts` |
| `src/a2a_utils/types.py` | `src/types.ts` |
| `src/a2a_utils/artifacts/__init__.py` | `src/artifacts/index.ts` |
| `src/a2a_utils/artifacts/text.py` | `src/artifacts/text.ts` |
| `src/a2a_utils/artifacts/data.py` | `src/artifacts/data.ts` |
| `src/a2a_utils/client/__init__.py` | `src/client/index.ts` |
| `src/a2a_utils/client/a2a_session.py` | `src/client/a2a-session.ts` |
| `src/a2a_utils/client/a2a_tools.py` | `src/client/a2a-tools.ts` |
| `src/a2a_utils/client/agent_manager.py` | `src/client/agent-manager.ts` |
| `src/a2a_utils/files/__init__.py` | `src/files/index.ts` |
| `src/a2a_utils/files/file_store.py` | `src/files/file-store.ts` |
| `src/a2a_utils/files/local_file_store.py` | `src/files/local-file-store.ts` |
| `src/a2a_utils/tasks/__init__.py` | `src/tasks/index.ts` |
| `src/a2a_utils/tasks/json_task_store.py` | `src/tasks/json-task-store.ts` |

## 2. Class & Function Mapping

### types

| Python | TypeScript |
|--------|-----------|
| `AgentURLAndCustomHeaders` (frozen dataclass) | `AgentURLAndCustomHeaders` (interface) |
| `ArtifactSettings` (frozen dataclass) | `ArtifactSettings` (class with constructor defaults) |
| `TextPartForLLM` (frozen dataclass) | `TextPartForLLM` (interface) |
| `DataPartForLLM` (frozen dataclass) | `DataPartForLLM` (interface) |
| `FilePartForLLM` (frozen dataclass) | `FilePartForLLM` (interface) |
| `ArtifactForLLM` (frozen dataclass) | `ArtifactForLLM` (interface) |
| `MessageForLLM` (frozen dataclass) | `MessageForLLM` (interface) |
| `TaskStatusForLLM` (frozen dataclass) | `TaskStatusForLLM` (interface) |
| `TaskForLLM` (frozen dataclass) | `TaskForLLM` (interface) |

### artifacts/text

| Python | TypeScript |
|--------|-----------|
| `TextArtifacts.view()` | `TextArtifacts.view()` |
| `TextArtifacts.minimize()` | `TextArtifacts.minimize()` |
| `TextArtifacts._parse_line_range()` | `TextArtifacts._parseLineRange()` |

### artifacts/data

| Python | TypeScript |
|--------|-----------|
| `DataArtifacts.view()` | `DataArtifacts.view()` |
| `DataArtifacts.minimize()` | `DataArtifacts.minimize()` |
| `DataArtifacts.summarize_table()` | `DataArtifacts.summarizeTable()` |
| `DataArtifacts.summarize_values()` | `DataArtifacts.summarizeValues()` |
| `DataArtifacts._minimize_object()` | `DataArtifacts._minimizeObject()` |
| `DataArtifacts._evaluate_json_path()` | `DataArtifacts._evaluateJsonPath()` |
| `DataArtifacts._parse_row_selection()` | `DataArtifacts._parseRowSelection()` |
| `DataArtifacts._parse_column_selection()` | `DataArtifacts._parseColumnSelection()` |
| `DataArtifacts._filter_data_by_rows_and_columns()` | `DataArtifacts._filterDataByRowsAndColumns()` |
| `DataArtifacts._minimize_object_values()` | `DataArtifacts._minimizeObjectValues()` |

Module-level helpers (TS only, not class methods):

| Python (inline) | TypeScript |
|-----------------|-----------|
| `json.dumps(v, sort_keys=True)` | `stableStringify(obj)` |
| `statistics.mean()` | `mean(nums)` |
| `statistics.stdev()` | `stdev(nums)` |
| type check logic | `getTypeName(v)` |
| `dict.fromkeys(chain.from_iterable(...))` | `uniqueColumns(data)` |

### artifacts/\_\_init\_\_

| Python | TypeScript |
|--------|-----------|
| `minimize_artifacts()` | `minimizeArtifacts()` |

### client/agent\_manager

| Python | TypeScript |
|--------|-----------|
| `AgentManager.__init__()` | `AgentManager.constructor()` |
| `AgentManager.add_agent()` | `AgentManager.addAgent()` |
| `AgentManager.get_agent()` | `AgentManager.getAgent()` |
| `AgentManager.get_agents()` | `AgentManager.getAgents()` |
| `AgentManager.get_agent_for_llm()` | `AgentManager.getAgentForLlm()` |
| `AgentManager.get_agents_for_llm()` | `AgentManager.getAgentsForLlm()` |
| `AgentManager._load_config()` | `AgentManager._loadConfig()` |
| `AgentManager._ensure_initialized()` | `AgentManager._ensureInitialized()` |
| `AgentManager._fetch_agent()` | `AgentManager._fetchAgent()` |
| `AgentManager._parse_agent_card_url()` | `AgentManager._parseAgentCardUrl()` |
| `AgentManager._format_agent_for_llm()` | `AgentManager._formatAgentForLlm()` |

### client/agent\_manager (properties)

| Python | TypeScript |
|--------|-----------|
| `AgentManager.initialization_errors` (property) | `AgentManager.initializationErrors` (getter) |

### client/a2a\_session

| Python | TypeScript |
|--------|-----------|
| `A2ASession.__init__()` | `A2ASession.constructor()` |
| `A2ASession.send_message()` | `A2ASession.sendMessage()` |
| `A2ASession.get_task()` | `A2ASession.getTask()` |
| `A2ASession._save_files()` | `A2ASession._saveFiles()` |
| `A2ASession._get_task_streaming()` | `A2ASession._getTaskStreaming()` |
| `A2ASession._get_task_polling()` | `A2ASession._getTaskPolling()` |
| `A2ASession._fetch_task()` | `A2ASession._fetchTask()` |
| `A2ASession._resolve_agent()` | `A2ASession._resolveAgent()` |
| *(N/A)* | `A2ASession._createClient()` *(TS-only helper for custom headers)* |

### client/a2a\_tools

| Python | TypeScript |
|--------|-----------|
| `A2ATools.__init__()` | `A2ATools.constructor()` |
| `A2ATools.get_agents()` | `A2ATools.getAgents()` |
| `A2ATools.get_agent()` | `A2ATools.getAgent()` |
| `A2ATools.send_message()` | `A2ATools.sendMessage()` |
| `A2ATools.get_task()` | `A2ATools.getTask()` |
| `A2ATools.view_text_artifact()` | `A2ATools.viewTextArtifact()` |
| `A2ATools.view_data_artifact()` | `A2ATools.viewDataArtifact()` |
| `A2ATools._build_task_for_llm()` | `A2ATools._buildTaskForLlm()` |
| `A2ATools._build_message_for_llm()` | `A2ATools._buildMessageForLlm()` |
| `A2ATools._get_artifact()` | `A2ATools._getArtifact()` |
| `A2ATools._extract_text()` | `A2ATools._extractText()` |
| `A2ATools._extract_data()` | `A2ATools._extractData()` |
| `A2ATools._parse_rows()` | `A2ATools._parseRows()` |
| `A2ATools._parse_columns()` | `A2ATools._parseColumns()` |
| `A2ATools._serialize_for_json()` | *(not needed — no dataclasses in TS)* |
| `TEXT_MINIMIZED_TIP` | `TEXT_MINIMIZED_TIP` |
| `DATA_MINIMIZED_TIP` | `DATA_MINIMIZED_TIP` |

### files/file\_store

| Python | TypeScript |
|--------|-----------|
| `FileStore` (ABC) | `FileStore` (interface) |
| `FileStore.save()` | `FileStore.save()` |
| `FileStore.get()` | `FileStore.get()` |
| `FileStore.delete()` | `FileStore.delete()` |

### files/local\_file\_store

| Python | TypeScript |
|--------|-----------|
| `LocalFileStore.__init__()` | `LocalFileStore.constructor()` |
| `LocalFileStore.save()` | `LocalFileStore.save()` |
| `LocalFileStore.get()` | `LocalFileStore.get()` |
| `LocalFileStore.delete()` | `LocalFileStore.delete()` |
| `LocalFileStore._get_httpx_client()` | *(not needed — uses global `fetch`)* |

### tasks/json\_task\_store

| Python | TypeScript |
|--------|-----------|
| `JSONTaskStore.__init__()` | `JSONTaskStore.constructor()` |
| `JSONTaskStore.save()` | `JSONTaskStore.save()` |
| `JSONTaskStore.get()` | `JSONTaskStore.load()` |
| `JSONTaskStore.delete()` | `JSONTaskStore.delete()` |

> **Note:** Python SDK's `TaskStore` ABC uses `get()`. JS SDK's `TaskStore` interface uses `load()`. The TS `JSONTaskStore` implements `load()` to satisfy the SDK interface. Python's `get()` maps to TS's `load()`.

## 3. Naming Conventions

| Context | Python | TypeScript |
|---------|--------|-----------|
| Code identifiers | `snake_case` | `camelCase` |
| File names | `snake_case.py` | `kebab-case.ts` |
| Output metadata keys | `snake_case` | `snake_case` (preserved for artifact metadata compatibility) |
| Class names | `PascalCase` | `PascalCase` |
| Constants | `UPPER_SNAKE_CASE` | `UPPER_SNAKE_CASE` |

Artifact metadata keys that must remain snake_case in both languages:
- `_total_lines`, `_total_characters`, `_shown_lines`, `_shown_characters`
- `_character_limit`, `_tip`
- `_total_items`, `_total_keys`, `_sample_keys`, `_sample_value`
- `count`, `unique_count`, `types`, `json_length_minimum`, `json_length_maximum`
- `length_minimum`, `length_maximum`, `minimum`, `maximum`, `mean`, `stdev`
- `sample_value`, `saved_file_paths`

LLM-facing object fields in the TypeScript package follow the JavaScript SDK's camelCase naming:
- `contextId`, `artifactId`, `mimeType`

## 4. SDK Translation Patterns

### Part Access

```python
# Python
part.root.text          # TextPart
part.root.data          # DataPart
part.root.file          # FilePart
isinstance(part.root, TextPart)
```

```typescript
// TypeScript
part.text               // after part.kind === "text"
part.data               // after part.kind === "data"
part.file               // after part.kind === "file"
part.kind === "text"
```

### File Type Discrimination

```python
# Python
isinstance(file_obj, FileWithBytes)
isinstance(file_obj, FileWithUri)
```

```typescript
// TypeScript
"bytes" in fileObj
"uri" in fileObj
```

### TaskStore

```python
# Python
task_store.get(task_id)    # TaskStore ABC method
```

```typescript
// TypeScript
taskStore.load(taskId)     // TaskStore interface method
```

### A2AClient Construction & Usage

```python
# Python
client = A2AClient(httpx_client=httpx_client, agent_card=card)
request = SendMessageRequest(params=MessageSendParams(...))
response = await client.send_message(request)
result = response.root
```

```typescript
// TypeScript
const client = new A2AClient(card, { fetch: wrappedFetch })
const response = await client.sendMessage({ message, configuration })
// response is SendMessageResponse directly
```

### Custom Headers

```python
# Python
await client.send_message(request, http_kwargs={"headers": custom_headers})
```

```typescript
// TypeScript — via fetchImpl wrapper at client construction
const wrappedFetch = (input, init?) => {
    const headers = new Headers(init?.headers);
    for (const [k, v] of Object.entries(customHeaders)) {
        headers.set(k, v);
    }
    return fetch(input, { ...init, headers });
};
const client = new A2AClient(card, { fetch: wrappedFetch });
```

### Response Unwrapping

```python
# Python
result = response.root
if isinstance(result, JSONRPCError):
    raise ...
if isinstance(result.result, Message):
    ...
elif isinstance(result.result, Task):
    ...
```

```typescript
// TypeScript
if ("error" in response) {
    throw ...
}
const result = response.result;
if (result.kind === "message") { ... }
else if (result.kind === "task") { ... }
```

### Agent Card Resolution

```python
# Python
resolver = A2ACardResolver(httpx_client=httpx.AsyncClient(), base_url=base, agent_card_path=path)
card = await resolver.get_agent_card()
```

```typescript
// TypeScript
const resolver = new DefaultAgentCardResolver(baseUrl, path);
const card = await resolver.resolve();
```

### Lazy Initialization (Concurrency)

```python
# Python — asyncio.Lock
async with self._lock:
    if self._initialized:
        return
    ...
```

```typescript
// TypeScript — single-flight Promise
if (this._initPromise) {
    return this._initPromise;
}
this._initPromise = (async () => { ... })();
return this._initPromise;
```

### Concurrent Fetching

```python
# Python
results = await asyncio.gather(*tasks, return_exceptions=True)
for result in results:
    if isinstance(result, Exception): ...
```

```typescript
// TypeScript
const results = await Promise.allSettled(promises);
for (const result of results) {
    if (result.status === "rejected") { ... }
}
```

## 5. Type Mapping

| Python | TypeScript | Notes |
|--------|-----------|-------|
| `Any` | `unknown` | `DataPartForLLM.data` |
| `dict[str, Any]` | `Record<string, unknown>` | |
| `dict[str, str]` | `Record<string, string>` | Custom headers |
| `list[T]` | `T[]` | |
| `tuple[int, int]` | `[number, number]` | Line range return |
| `str \| None` | `string \| null` | |
| `int` | `number` | |
| `float` | `number` | JS has no int/float distinction |
| `bool` | `boolean` | `typeof v === "boolean"` checked before `"number"` |
| `TaskState` (enum) | `TaskState` (string union) | From respective SDKs |
| `Artifact` (SDK) | `Artifact` (SDK) | |
| `AgentCard` (SDK) | `AgentCard` (SDK) | |
| `Task` (SDK) | `Task` (SDK) | |
| `Message` (SDK) | `Message` (SDK) | |
| `ABC` (abstract class) | `interface` | `FileStore` |
| `@dataclass(frozen=True)` | `readonly` interface | Immutable types |

## 6. Behavioral Parity Notes

### Inflation Guard
Both implementations return the original value unchanged when the summarized/minimized form would be larger than the original. This applies to:
- `summarizeValues()` — returns raw array if summary JSON would be longer
- `summarizeTable()` — returns raw data if summary JSON would be longer
- `minimize()` (both Text and Data) — returns original if minimized is larger

### Tip Convention
- `minimize()` methods default `tip` to `null`/`None` (no tip)
- `A2ASession.sendMessage()` passes tips via `minimizeArtifacts(textTip=TEXT_MINIMIZED_TIP, dataTip=DATA_MINIMIZED_TIP)`
- Tip constants live in `client/a2a-tools` module, not in artifact modules

### Line/Character Range Semantics
- Line ranges are 1-based inclusive on both ends (user-facing)
- Internally converted to 0-based for array slicing
- Negative indices supported (count from end)
- Line selection and character selection are mutually exclusive (throws Error/ValueError)

### Error Messages
Error message strings are kept identical between Python and TypeScript for consistent API behavior. Key messages:
- `"out of range"` — row/line index out of bounds
- `"greater than"` — range start > end
- `"not found"` — column name not found
- `"Invalid row selection"` / `"Invalid column selection type"` — wrong input type
- `"exceeds"` — character limit exceeded
- `"already registered"` — duplicate agent ID

### Number Type Discrimination
Python naturally distinguishes `int`, `float`, and `bool`. In TypeScript:
- `typeof v === "boolean"` must be checked **before** `typeof v === "number"`
- `Number.isInteger(v)` distinguishes `"int"` from `"float"`

### Statistics
- Python uses `statistics.mean()` and `statistics.stdev()` (sample stdev, n-1 divisor)
- TypeScript uses inline `mean()` and `stdev()` helpers with identical formulas

### Unique Count
- Python: `len(set(json.dumps(v, sort_keys=True) for v in values))`
- TypeScript: `new Set(values.map(v => stableStringify(v))).size`
- `stableStringify()` recursively sorts object keys to match Python's `sort_keys=True`

## 7. Test Mapping

| Python Test | TypeScript Test |
|------------|----------------|
| `test_version.py` | `tests/index.test.ts` |
| `test_data_json_path.py` | `tests/data-json-path.test.ts` |
| `test_data_minimization.py` | `tests/data-minimization.test.ts` |
| `test_data_selection.py` | `tests/data-selection.test.ts` |
| `test_data_summary.py` | `tests/data-summary.test.ts` |
| `test_a2a_session.py` | `tests/a2a-session.test.ts` |
| `test_a2a_tools.py` | `tests/a2a-tools.test.ts` |
| `test_agent_manager.py` | `tests/agent-manager.test.ts` |
| `test_file_store.py` | `tests/file-store.test.ts` |
| `test_json_task_store.py` | `tests/json-task-store.test.ts` |

### Test Adaptations

| Python | TypeScript |
|--------|-----------|
| `pytest.raises(ValueError)` | `expect(...).toThrow()` |
| `AsyncMock` / `MagicMock` | Plain object mocks or `mock()` from `bun:test` |
| `tmp_path` fixture | `mkdtemp()` in `beforeEach` + cleanup in `afterEach` |
| `random.seed(42)` | Assert `sample_value` is in source data (not exact match) |
| `asyncio_mode = "auto"` | Bun handles async tests natively |
| `isinstance(v, float)` | `3.14` → `{}` for invalid type test (JS has no float type) |

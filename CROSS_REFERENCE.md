# Cross-Reference: Python ↔ JavaScript

This document tracks the maintained parity between the two `a2a-utils` packages:

- Python: `python/`
- JavaScript: `javascript/`

It intentionally focuses on the public surface area and known implementation differences. The previous method-by-method inventory was too easy to let drift.

## Why This Lives At The Repo Root

This is a two-way reference between the Python and JavaScript packages, not documentation owned by one side. Keeping it in `a2a-utils/` makes that relationship explicit.

## Package Layout Mapping

| Python | JavaScript |
| --- | --- |
| `python/src/a2a_utils/__init__.py` | `javascript/src/index.ts` |
| `python/src/a2a_utils/types.py` | `javascript/src/types.ts` |
| `python/src/a2a_utils/artifacts/` | `javascript/src/artifacts/` |
| `python/src/a2a_utils/client/` | `javascript/src/client/` |
| `python/src/a2a_utils/files/` | `javascript/src/files/` |
| `python/src/a2a_utils/tasks/` | `javascript/src/tasks/` |
| `python/tests/` | `javascript/tests/` |

## Public API Parity

The root package exports are intentionally aligned.

| Python export | JavaScript export |
| --- | --- |
| `__version__` | `VERSION` |
| `A2ASession` | `A2ASession` |
| `A2ATools` | `A2ATools` |
| `AgentManager` | `AgentManager` |
| `JSONTaskStore` | `JSONTaskStore` |
| `DataArtifacts` | `DataArtifacts` |
| `TextArtifacts` | `TextArtifacts` |
| `minimize_artifacts` | `minimizeArtifacts` |
| `FileStore` | `FileStore` |
| `LocalFileStore` | `LocalFileStore` |
| `TERMINAL_OR_ACTIONABLE_STATES` | `TERMINAL_OR_ACTIONABLE_STATES` |
| `AgentURLAndCustomHeaders` | `AgentURLAndCustomHeaders` |
| `ArtifactSettings` | `ArtifactSettings` |
| `TextPartForLLM` | `TextPartForLLM` |
| `DataPartForLLM` | `DataPartForLLM` |
| `FilePartForLLM` | `FilePartForLLM` |
| `ArtifactForLLM` | `ArtifactForLLM` |
| `MessageForLLM` | `MessageForLLM` |
| `TaskStatusForLLM` | `TaskStatusForLLM` |
| `TaskForLLM` | `TaskForLLM` |

## Module Mapping

| Python module | JavaScript module | Notes |
| --- | --- | --- |
| `client/a2a_session.py` | `client/a2a-session.ts` | Same role, same top-level methods |
| `client/a2a_tools.py` | `client/a2a-tools.ts` | Same tool surface |
| `client/agent_manager.py` | `client/agent-manager.ts` | Same agent registry model |
| `artifacts/text.py` | `artifacts/text.ts` | Same text artifact viewing/minimization behavior |
| `artifacts/data.py` | `artifacts/data.ts` | Same data artifact viewing/minimization goals |
| `artifacts/__init__.py` | `artifacts/index.ts` | Shared artifact conversion/minimization entrypoint |
| `files/file_store.py` | `files/file-store.ts` | Abstract contract vs interface |
| `files/local_file_store.py` | `files/local-file-store.ts` | Local file persistence |
| `tasks/json_task_store.py` | `tasks/json-task-store.ts` | Disk-backed task persistence |

## Intentional Differences

These are expected and should not be treated as parity bugs by themselves.

| Area | Python | JavaScript |
| --- | --- | --- |
| Version symbol | `__version__` | `VERSION` |
| Naming style | `snake_case` | `camelCase` |
| File naming | `snake_case.py` | `kebab-case.ts` |
| LLM type containers | frozen dataclasses | interfaces plus `ArtifactSettings` class |
| `TaskStore` read method | `get()` | `load()` |
| Agent card resolution | `A2ACardResolver` | `DefaultAgentCardResolver` |
| HTTP client/header wiring | `httpx` request kwargs | wrapped `fetch` passed to client |
| Concurrency guard pattern | `asyncio.Lock` | single-flight `Promise` |
| Task/file validation | Pydantic-backed SDK models | plain JS objects typed against SDK |

## Behavioral Expectations

- `A2ASession` should expose the same user-facing flow in both packages:
  send a message, continue by `context_id` or `contextId`, persist tasks, optionally persist files, and monitor unfinished tasks until terminal or actionable states.
- `A2ATools` should keep the same six user-facing tool methods:
  `getAgents`, `getAgent`, `sendMessage`, `getTask`, `viewTextArtifact`, and `viewDataArtifact` in JavaScript;
  `get_agents`, `get_agent`, `send_message`, `get_task`, `view_text_artifact`, and `view_data_artifact` in Python.
- Artifact minimization should stay behaviorally aligned even when helper structure differs.
- Metadata keys emitted for minimized artifacts should remain `snake_case` in both packages for compatibility.
- LLM-facing object fields exposed from the JavaScript package may remain idiomatic to the JS SDK, for example `contextId`, `artifactId`, and `mimeType`.

## Test Mapping

The test suites are intended to mirror the same feature areas.

| Python test | JavaScript test |
| --- | --- |
| `tests/test_version.py` | `tests/index.test.ts` |
| `tests/test_data_json_path.py` | `tests/data-json-path.test.ts` |
| `tests/test_data_minimization.py` | `tests/data-minimization.test.ts` |
| `tests/test_data_selection.py` | `tests/data-selection.test.ts` |
| `tests/test_data_summary.py` | `tests/data-summary.test.ts` |
| `tests/test_a2a_session.py` | `tests/a2a-session.test.ts` |
| `tests/test_a2a_tools.py` | `tests/a2a-tools.test.ts` |
| `tests/test_agent_manager.py` | `tests/agent-manager.test.ts` |
| `tests/test_file_store.py` | `tests/file-store.test.ts` |
| `tests/test_json_task_store.py` | `tests/json-task-store.test.ts` |

## Maintenance Rules

- Update this file when either package changes its exported API, module layout, or a deliberate cross-language behavior difference.
- Do not track private helpers unless a mismatch affects user-visible behavior.
- If a change is intentionally language-specific, record it under `Intentional Differences` instead of forcing fake symmetry.

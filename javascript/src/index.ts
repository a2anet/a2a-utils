// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

export const VERSION = "0.3.0"; // x-release-please-version

// Core
export { A2ASession } from "./client/a2a-session.js";
export { A2ATools } from "./client/a2a-tools.js";
export { AgentManager } from "./client/agent-manager.js";
export { JSONTaskStore } from "./tasks/json-task-store.js";

// Artifacts
export { DataArtifacts, TextArtifacts, minimizeArtifacts } from "./artifacts/index.js";

// Files
export type { FileStore } from "./files/file-store.js";
export { LocalFileStore } from "./files/local-file-store.js";

// Types
export type {
    AgentURLAndCustomHeaders,
    ArtifactForLLM,
    DataPartForLLM,
    FilePartForLLM,
    MessageForLLM,
    TaskForLLM,
    TaskStatusForLLM,
    TextPartForLLM,
} from "./types.js";
export { ArtifactSettings, TERMINAL_OR_ACTIONABLE_STATES } from "./types.js";

// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Ready-made agent tools for A2A communication.
 */

import type { Artifact, FileWithUri, Message, Part, Task } from "@a2a-js/sdk";
import { DataArtifacts, TextArtifacts, minimizeArtifacts } from "../artifacts/index.js";
import type {
    ArtifactForLLM,
    DataPartForLLM,
    FilePartForLLM,
    JsonValue,
    MessageForLLM,
    TaskForLLM,
    TextPartForLLM,
} from "../types.js";
import { ArtifactSettings } from "../types.js";
import type { A2ASession } from "./a2a-session.js";

export const TEXT_MINIMIZED_TIP =
    "Text was minimized. Call view_text_artifact() to view specific line ranges.";
export const DATA_MINIMIZED_TIP =
    "Data was minimized. Call view_data_artifact() to navigate to specific data.";

/**
 * LLM-friendly tools that can be used out-of-the-box with agent frameworks.
 *
 * Each method has LLM-friendly docstrings, returns JSON-serialisable objects, and returns actionable error messages.
 */
export class A2ATools {
    private readonly session: A2ASession;
    private readonly artifactSettings: ArtifactSettings;

    constructor(session: A2ASession, opts?: { artifactSettings?: ArtifactSettings | null }) {
        this.session = session;
        this.artifactSettings = opts?.artifactSettings ?? new ArtifactSettings();
    }

    /**
     * List all available agents with their names and descriptions.
     *
     * Use this first to discover what agents are available before sending messages.
     * Each agent has a unique ID (the key) that you'll need for other tools like
     * send_message and get_agent.
     *
     * Returns an object mapping agent IDs to their name and description.
     * If any agents failed to load, an "errors" field is included with details.
     */
    async getAgents(): Promise<Record<string, unknown>> {
        try {
            const result = await this.session.agents.getAgentsForLlm("basic");
            const initErrors = this.session.agents.initializationErrors;
            if (Object.keys(result).length === 0 && Object.keys(initErrors).length > 0) {
                const errors: Record<string, string> = {};
                for (const [agentId, error] of Object.entries(initErrors)) {
                    errors[agentId] = `Failed to load agent: ${error}`;
                }
                return { agents: result, errors };
            }
            return result;
        } catch (e) {
            return { error: true, error_message: `Failed to list agents: ${e}` };
        }
    }

    /**
     * Get detailed information about a specific agent, including its skills.
     *
     * Use this after get_agents to learn more about what a specific agent can do.
     * The response includes the agent's name, description, and a list of skills
     * with their descriptions.
     *
     * @param agentId - The agent's unique identifier (from get_agents).
     */
    async getAgent(agentId: string): Promise<Record<string, unknown>> {
        try {
            const result = await this.session.agents.getAgentForLlm(agentId, "full");
            if (result === null) {
                const available = Object.keys(await this.session.agents.getAgents()).sort();
                return {
                    error: true,
                    error_message: `Agent '${agentId}' not found. Use get_agents to see available agents. Available: ${available.length > 0 ? available.join(", ") : "(none)"}`,
                };
            }
            return result;
        } catch (e) {
            return { error: true, error_message: `Failed to get agent info: ${e}` };
        }
    }

    /**
     * Send a message to an agent and receive a structured response.
     *
     * This is the primary way to communicate with agents. The response includes
     * the agent's reply and any generated artifacts.
     *
     * Artifact data in responses may be minimized for display. Fields prefixed
     * with "_" indicate metadata about minimized content. Use view_text_artifact
     * or view_data_artifact to access full artifact data.
     *
     * If the task is still in progress after the timeout, the response includes
     * a task_id. Use get_task with that task_id to continue monitoring.
     *
     * @param agentId - ID of the agent to message (from get_agents).
     * @param message - The message content to send.
     * @param opts.contextId - Continue an existing conversation by providing its context ID.
     *     Omit to start a new conversation.
     * @param opts.taskId - Attach to an existing task (for input_required flows).
     * @param opts.timeout - Override the default timeout in seconds.
     * @param opts.data - Structured data to include with the message. Each item
     *     is sent as a separate JSON object or array alongside the text.
     * @param opts.files - Files to include with the message. Accepts local file
     *     paths (read and sent as binary, max 1MB) or URLs (sent as references
     *     for the remote agent to fetch).
     */
    async sendMessage(
        agentId: string,
        message: string,
        opts?: {
            contextId?: string | null;
            taskId?: string | null;
            timeout?: number | null;
            data?: JsonValue[];
            files?: string[];
        },
    ): Promise<Record<string, unknown>> {
        try {
            const result = await this.session.sendMessage(agentId, message, opts);
            let llmResult: TaskForLLM | MessageForLLM;
            if (result.kind === "task") {
                llmResult = await this.buildTaskForLlm(result as Task);
            } else {
                llmResult = await this.buildMessageForLlm(result as Message);
            }
            return llmResult as unknown as Record<string, unknown>;
        } catch (e) {
            const errorMsg = String(e);
            if (errorMsg.toLowerCase().includes("not found")) {
                return {
                    error: true,
                    error_message: `${errorMsg} Use get_agents to see available agents.`,
                };
            }
            if (e instanceof DOMException && e.name === "TimeoutError") {
                return {
                    error: true,
                    error_message:
                        "Request timed out. You can retry with a longer timeout, " +
                        "or if a task_id was returned earlier, use get_task to check progress.",
                };
            }
            return { error: true, error_message: `Failed to send message: ${e}` };
        }
    }

    /**
     * Check the progress of a task that is still in progress.
     *
     * Use this after send_message returns a task in a non-terminal state
     * (e.g. "working") to monitor its progress.
     *
     * If the task is still running after the timeout, the current state is
     * returned. Call get_task again to continue monitoring.
     *
     * @param agentId - ID of the agent that owns the task.
     * @param taskId - Task ID from a previous send_message response.
     * @param timeout - Override the monitoring timeout in seconds.
     * @param pollInterval - Override the interval between status checks in seconds.
     */
    async getTask(
        agentId: string,
        taskId: string,
        timeout?: number | null,
        pollInterval?: number | null,
    ): Promise<Record<string, unknown>> {
        try {
            const result = await this.session.getTask(agentId, taskId, {
                timeout,
                pollInterval,
            });
            const llmResult = await this.buildTaskForLlm(result);
            return llmResult as unknown as Record<string, unknown>;
        } catch (e) {
            const errorMsg = String(e);
            if (errorMsg.toLowerCase().includes("not found")) {
                return {
                    error: true,
                    error_message: `${errorMsg} Use get_agents to see available agents.`,
                };
            }
            if (e instanceof DOMException && e.name === "TimeoutError") {
                return {
                    error: true,
                    error_message:
                        "Request timed out. You can retry with a longer timeout, " +
                        "or use get_task again to continue monitoring.",
                };
            }
            return { error: true, error_message: `Failed to get task: ${e}` };
        }
    }

    /**
     * View text content from an artifact, optionally selecting a range.
     *
     * Use this for artifacts containing text (documents, logs, code, etc.).
     * You can select by line range OR character range, but not both.
     *
     * @param agentId - ID of the agent that produced the artifact.
     * @param taskId - Task ID containing the artifact.
     * @param artifactId - The artifact's unique identifier (from the task's artifacts list).
     * @param lineStart - Starting line number (1-based, inclusive).
     * @param lineEnd - Ending line number (1-based, inclusive).
     * @param characterStart - Starting character index (0-based, inclusive).
     * @param characterEnd - Ending character index (0-based, exclusive).
     */
    async viewTextArtifact(
        agentId: string,
        taskId: string,
        artifactId: string,
        lineStart?: number | null,
        lineEnd?: number | null,
        characterStart?: number | null,
        characterEnd?: number | null,
    ): Promise<Record<string, unknown>> {
        try {
            const artifact = await this.getArtifact(agentId, taskId, artifactId);
            const text = A2ATools.extractText(artifact);
            const filtered = TextArtifacts.view(text, {
                lineStart,
                lineEnd,
                characterStart,
                characterEnd,
                characterLimit: this.artifactSettings.viewArtifactCharacterLimit,
            });
            const result: ArtifactForLLM = {
                artifactId: artifact.artifactId,
                description: artifact.description ?? null,
                name: artifact.name ?? null,
                parts: [{ kind: "text", text: filtered }],
            };
            return result as unknown as Record<string, unknown>;
        } catch (e) {
            const errorMsg = String(e);
            if (errorMsg.toLowerCase().includes("not found")) {
                if (errorMsg.toLowerCase().includes("artifact")) {
                    return {
                        error: true,
                        error_message: `Artifact '${artifactId}' not found in task '${taskId}'. Check the task's artifacts list for valid artifact IDs.`,
                    };
                }
                return {
                    error: true,
                    error_message: `${errorMsg} Use get_agents to see available agents.`,
                };
            }
            return { error: true, error_message: `Failed to view text artifact: ${e}` };
        }
    }

    /**
     * View structured data from an artifact with optional filtering.
     *
     * Use this for artifacts containing JSON data (objects, arrays, tables).
     * You can navigate to specific data with json_path, then filter with
     * rows and columns for tabular data.
     *
     * @param agentId - ID of the agent that produced the artifact.
     * @param taskId - Task ID containing the artifact.
     * @param artifactId - The artifact's unique identifier (from the task's artifacts list).
     * @param jsonPath - Dot-separated path to navigate into the data (e.g. "results.items").
     * @param rows - Row selection for list data. Examples: "0" (single row), "0-10" (range),
     *     "0,2,5" (specific rows), "all" (every row).
     * @param columns - Column selection for tabular data (list of objects). Examples:
     *     "name" (single column), "name,age" (multiple columns), "all" (every column).
     */
    async viewDataArtifact(
        agentId: string,
        taskId: string,
        artifactId: string,
        jsonPath?: string | null,
        rows?: string | null,
        columns?: string | null,
    ): Promise<Record<string, unknown>> {
        try {
            const parsedRows = A2ATools.parseRows(rows ?? null);
            const parsedColumns = A2ATools.parseColumns(columns ?? null);

            const artifact = await this.getArtifact(agentId, taskId, artifactId);
            const data = A2ATools.extractData(artifact);
            const filtered = DataArtifacts.view(data, {
                jsonPath,
                rows: parsedRows,
                columns: parsedColumns,
                characterLimit: this.artifactSettings.viewArtifactCharacterLimit,
            });
            const result: ArtifactForLLM = {
                artifactId: artifact.artifactId,
                description: artifact.description ?? null,
                name: artifact.name ?? null,
                parts: [{ kind: "data", data: filtered }],
            };
            return result as unknown as Record<string, unknown>;
        } catch (e) {
            const errorMsg = String(e);
            if (errorMsg.toLowerCase().includes("not found")) {
                if (errorMsg.toLowerCase().includes("artifact")) {
                    return {
                        error: true,
                        error_message: `Artifact '${artifactId}' not found in task '${taskId}'. Check the task's artifacts list for valid artifact IDs.`,
                    };
                }
                return {
                    error: true,
                    error_message: `${errorMsg} Use get_agents to see available agents.`,
                };
            }
            return { error: true, error_message: `Failed to view data artifact: ${e}` };
        }
    }

    // -- LLM conversion methods --

    /**
     * Convert an A2A Message to MessageForLLM.
     *
     * Combines all TextParts into a single TextPartForLLM.
     * Includes FileParts with saved path metadata.
     */
    private async buildMessageForLlm(message: Message): Promise<MessageForLLM> {
        const parts: (TextPartForLLM | DataPartForLLM | FilePartForLLM)[] = [];

        // Combine all text parts
        const textSegments: string[] = [];
        for (const part of message.parts) {
            if (part.kind === "text") {
                textSegments.push(part.text);
            }
        }

        if (textSegments.length > 0) {
            parts.push({ kind: "text", text: textSegments.join("") });
        }

        // Each data part stays separate
        for (const part of message.parts) {
            if (part.kind === "data") {
                parts.push({ kind: "data", data: part.data });
            }
        }

        // Handle file parts
        let savedPaths: string[] = [];
        if (this.session.fileStore !== null) {
            savedPaths = await this.session.fileStore.getMessage(message.messageId);
        }
        const hasSavedPaths = savedPaths.length > 0;

        for (const part of message.parts) {
            if (part.kind === "file") {
                parts.push(A2ATools.buildFilePartForLlm(part, hasSavedPaths ? savedPaths : null));
            }
        }

        return {
            contextId: message.contextId ?? null,
            kind: "message",
            parts,
        };
    }

    /** Convert a Task to TaskForLLM with artifact minimization and file path queries. */
    private async buildTaskForLlm(task: Task): Promise<TaskForLLM> {
        // Query fileStore for saved file paths
        let savedFilePaths: Record<string, string[]> | null = null;
        if (this.session.fileStore !== null && task.artifacts) {
            savedFilePaths = {};
            for (const artifact of task.artifacts) {
                const paths = await this.session.fileStore.getArtifact(
                    task.id,
                    artifact.artifactId,
                );
                if (paths.length > 0) {
                    savedFilePaths[artifact.artifactId] = paths;
                }
            }
        }

        const minimized = task.artifacts
            ? minimizeArtifacts(task.artifacts, {
                  characterLimit: this.artifactSettings.sendMessageCharacterLimit,
                  minimizedObjectStringLength: this.artifactSettings.minimizedObjectStringLength,
                  savedFilePaths,
                  textTip: TEXT_MINIMIZED_TIP,
                  dataTip: DATA_MINIMIZED_TIP,
              })
            : [];

        // Build status message
        let statusMessage: MessageForLLM | null = null;
        if (task.status.message) {
            statusMessage = await this.buildMessageForLlm(task.status.message as Message);
        }

        return {
            id: task.id,
            contextId: task.contextId,
            kind: "task",
            status: {
                state: task.status.state,
                message: statusMessage,
            },
            artifacts: minimized,
        };
    }

    /**
     * Look up an artifact through the resolution chain.
     *
     * 1. Check the task store (local cache)
     * 2. Fetch fresh via session.getTask (remote retrieval)
     *
     * @returns The Artifact.
     *
     * @throws Error if artifact cannot be found.
     */
    private async getArtifact(
        agentId: string,
        taskId: string,
        artifactId: string,
    ): Promise<Artifact> {
        // 1. Check task store (local cache)
        const cachedTask = await this.session.taskStore.load(taskId);
        if (cachedTask?.artifacts) {
            for (const artifact of cachedTask.artifacts) {
                if (artifact.artifactId === artifactId) {
                    return artifact;
                }
            }
        }

        // 2. Fetch fresh via session.getTask
        const task = await this.session.getTask(agentId, taskId);
        if (task.artifacts) {
            for (const artifact of task.artifacts) {
                if (artifact.artifactId === artifactId) {
                    return artifact;
                }
            }
        }

        throw new Error(
            `Artifact '${artifactId}' not found in task '${taskId}'. The artifact may have expired or the task_id may be incorrect.`,
        );
    }

    /**
     * Extract text content from artifact parts.
     *
     * @throws Error if artifact does not contain text content.
     */
    private static extractText(artifact: Artifact): string {
        const textParts: string[] = [];
        for (const part of artifact.parts) {
            if (part.kind === "text") {
                textParts.push(part.text);
            }
        }
        if (textParts.length === 0) {
            const partTypes = [...new Set(artifact.parts.map((p) => p.kind))].sort();
            throw new Error(
                `Artifact '${artifact.artifactId}' does not contain text content. ` +
                    `Found part types: ${partTypes.join(", ")}`,
            );
        }
        return textParts.join("\n");
    }

    /**
     * Extract data content from artifact parts.
     *
     * @throws Error if artifact does not contain data content.
     */
    private static extractData(artifact: Artifact): unknown {
        const dataParts: unknown[] = [];
        for (const part of artifact.parts) {
            if (part.kind === "data") {
                dataParts.push(part.data);
            }
        }
        if (dataParts.length === 0) {
            const partTypes = [...new Set(artifact.parts.map((p) => p.kind))].sort();
            throw new Error(
                `Artifact '${artifact.artifactId}' does not contain data content. ` +
                    `Found part types: ${partTypes.join(", ")}`,
            );
        }
        return dataParts.length === 1 ? dataParts[0] : dataParts;
    }

    /**
     * Parse a rows string into the type expected by DataArtifacts.view.
     *
     * Accepts: "0" (single int), "0-10" (range string), "0,2,5" (comma-separated
     * list of ints), "all" (passthrough string), or null.
     */
    private static parseRows(rows: string | null): number | number[] | string | null {
        if (rows === null) {
            return null;
        }

        const trimmedRows = rows.trim();

        if (trimmedRows === "all") {
            return "all";
        }

        // Comma-separated list: "0,2,5"
        if (trimmedRows.includes(",")) {
            try {
                return trimmedRows.split(",").map((x) => {
                    const n = Number.parseInt(x.trim(), 10);
                    if (Number.isNaN(n)) {
                        throw new Error();
                    }
                    return n;
                });
            } catch {
                throw new Error(
                    `Invalid rows format: '${trimmedRows}'. Comma-separated values must be integers. Examples: '0', '0-10', '0,2,5', 'all'.`,
                );
            }
        }

        // Range string: "0-10"
        if (trimmedRows.includes("-")) {
            return trimmedRows;
        }

        // Single integer: "0"
        const n = Number.parseInt(trimmedRows, 10);
        if (Number.isNaN(n)) {
            throw new Error(
                `Invalid rows format: '${trimmedRows}'. Examples: '0' (single row), '0-10' (range), '0,2,5' (specific rows), 'all'.`,
            );
        }
        return n;
    }

    /**
     * Parse a columns string into the type expected by DataArtifacts.view.
     *
     * Accepts: "name" (single column), "name,age" (comma-separated list),
     * "all" (passthrough string), or null.
     */
    private static parseColumns(columns: string | null): string | string[] | null {
        if (columns === null) {
            return null;
        }

        const trimmedColumns = columns.trim();

        if (trimmedColumns === "all") {
            return "all";
        }

        // Comma-separated list: "name,age"
        if (trimmedColumns.includes(",")) {
            return trimmedColumns.split(",").map((c) => c.trim());
        }

        // Single column name
        return trimmedColumns;
    }

    /**
     * Build a FilePartForLLM from a file Part.
     *
     * Used by both message and artifact file handling.
     */
    private static buildFilePartForLlm(part: Part, savedPaths: string[] | null): FilePartForLLM {
        if (part.kind !== "file") {
            throw new Error("Expected file part");
        }

        const fileObj = part.file;
        const name = fileObj.name ?? null;
        const mimeType = fileObj.mimeType ?? null;

        if ("bytes" in fileObj) {
            if (savedPaths !== null) {
                return { kind: "file", name, mimeType, uri: null, bytes: { _saved_to: savedPaths } };
            }
            return {
                kind: "file",
                name,
                mimeType,
                uri: null,
                bytes: { _error: "No FileStore configured. Cannot access file bytes." },
            };
        }

        if ("uri" in fileObj) {
            if (savedPaths !== null) {
                return { kind: "file", name, mimeType, uri: { _saved_to: savedPaths }, bytes: null };
            }
            return {
                kind: "file",
                name,
                mimeType,
                uri: (fileObj as FileWithUri).uri,
                bytes: null,
            };
        }

        return { kind: "file", name, mimeType, uri: null, bytes: null };
    }
}

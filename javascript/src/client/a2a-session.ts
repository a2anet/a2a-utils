// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * A2ASession — main interface for interacting with A2A agents.
 */

import * as fsSync from "node:fs/promises";
import * as path from "node:path";
import type {
    AgentCard,
    GetTaskResponse,
    Message,
    Part,
    SendMessageResponse,
    Task,
    TaskIdParams,
    TaskStatusUpdateEvent,
} from "@a2a-js/sdk";
import { A2AClient } from "@a2a-js/sdk/client";
import { InMemoryTaskStore, type TaskStore } from "@a2a-js/sdk/server";
import { v4 as uuidv4 } from "uuid";
import type { FileStore } from "../files/file-store.js";
import { TERMINAL_OR_ACTIONABLE_STATES } from "../types.js";
import type { JsonObject } from "../types.js";
import type { A2AAgents } from "./a2a-agents.js";

type TaskStreamEvent = TaskStatusUpdateEvent | Task;

type SessionClient = A2AClient & {
    sendMessage(
        request: {
            message: Message;
            configuration: { blocking: boolean };
        },
        options?: { signal?: AbortSignal },
    ): Promise<SendMessageResponse>;
    getTask(params: TaskIdParams, options?: { signal?: AbortSignal }): Promise<GetTaskResponse>;
    resubscribeTask(
        params: TaskIdParams,
        options?: { signal?: AbortSignal },
    ): AsyncIterable<TaskStreamEvent>;
};

/** Main interface for sending messages to A2A agents. */
export class A2ASession {
    /** Maximum file size for local file uploads (1MB). */
    private static readonly MAX_FILE_SIZE = 1_048_576;

    /** Common MIME types by extension. */
    private static readonly MIME_TYPES: Record<string, string> = {
        ".pdf": "application/pdf",
        ".json": "application/json",
        ".xml": "application/xml",
        ".zip": "application/zip",
        ".gz": "application/gzip",
        ".tar": "application/x-tar",
        ".csv": "text/csv",
        ".txt": "text/plain",
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".ts": "text/typescript",
        ".md": "text/markdown",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
    };

    readonly agents: A2AAgents;
    readonly taskStore: TaskStore;
    readonly fileStore: FileStore | null;
    private readonly sendMessageTimeout: number;
    private readonly getTaskTimeout: number;
    private readonly getTaskPollInterval: number;

    constructor(
        agents: A2AAgents,
        opts?: {
            taskStore?: TaskStore;
            fileStore?: FileStore | null;
            sendMessageTimeout?: number;
            getTaskTimeout?: number;
            getTaskPollInterval?: number;
        },
    ) {
        this.agents = agents;
        this.taskStore = opts?.taskStore ?? new InMemoryTaskStore();
        this.fileStore = opts?.fileStore ?? null;
        this.sendMessageTimeout = opts?.sendMessageTimeout ?? 60.0;
        this.getTaskTimeout = opts?.getTaskTimeout ?? 60.0;
        this.getTaskPollInterval = opts?.getTaskPollInterval ?? 5.0;
    }

    /**
     * Send a message to an A2A agent.
     *
     * @param agentId - Registered agent identifier.
     * @param message - The message content to send.
     * @param opts.contextId - Optional context ID to continue a conversation.
     *     Auto-generated when null.
     * @param opts.taskId - Optional task ID to attach to the message.
     * @param opts.timeout - HTTP timeout in seconds. Defaults to sendMessageTimeout
     *     from constructor.
     * @param opts.data - Structured data to include with the message. Each item
     *     is sent as a separate JSON object alongside the text.
     * @param opts.files - Files to include with the message. Accepts local file
     *     paths (read and sent as binary, max 1MB) or URLs (sent as references
     *     for the remote agent to fetch).
     *
     * @returns Task for task responses, Message for message-only responses.
     *
     * @throws Error if agent is not found.
     */
    async sendMessage(
        agentId: string,
        message: string,
        opts?: {
            contextId?: string | null;
            taskId?: string | null;
            timeout?: number | null;
            data?: JsonObject[];
            files?: string[];
        },
    ): Promise<Task | Message> {
        const [agentCard, headers] = await this.resolveAgent(agentId);

        const contextId = opts?.contextId ?? uuidv4();

        // Build message parts
        const parts: Part[] = [{ kind: "text", text: message }];

        // Add data parts
        if (opts?.data) {
            for (const d of opts.data) {
                parts.push({ kind: "data", data: d });
            }
        }

        // Add file parts
        if (opts?.files) {
            for (const fileRef of opts.files) {
                parts.push(await this.buildFilePart(fileRef));
            }
        }

        // Build A2A message
        const a2aMessage: Message = {
            kind: "message",
            messageId: uuidv4(),
            parts,
            role: "user",
            contextId,
        };

        if (opts?.taskId != null) {
            a2aMessage.taskId = opts.taskId;
        }

        const effectiveTimeout =
            opts?.timeout !== undefined && opts?.timeout !== null
                ? opts.timeout
                : this.sendMessageTimeout;

        const start = performance.now();

        const client = this.createClient(agentCard, headers);
        const response: SendMessageResponse = await this.getSessionClient(client).sendMessage(
            {
                message: a2aMessage,
                configuration: { blocking: false },
            },
            { signal: AbortSignal.timeout(Math.round(effectiveTimeout * 1000)) },
        );

        if ("error" in response) {
            throw new Error(
                `JSON-RPC error: ${response.error.message} (code: ${response.error.code})`,
            );
        }

        const result = response.result;

        // Handle Message result
        if (result.kind === "message") {
            const msg = result as unknown as Message;
            await this.saveMessageFiles(msg);
            return msg;
        }

        // Handle Task result
        if (result.kind !== "task") {
            throw new Error("Expected Task or Message response, got unexpected kind");
        }

        let task = result as unknown as Task;
        await this.taskStore.save(task);

        // If task is already in a terminal/actionable state, save files and return
        if (TERMINAL_OR_ACTIONABLE_STATES.has(task.status.state)) {
            await this.saveTaskFiles(task);
            return task;
        }

        // Task is in a non-terminal state (e.g. working) — monitor with remaining time
        const elapsed = (performance.now() - start) / 1000;
        const remaining = Math.max(0, effectiveTimeout - elapsed);
        if (remaining > 0) {
            const supportsStreaming =
                agentCard.capabilities !== undefined &&
                agentCard.capabilities !== null &&
                agentCard.capabilities.streaming === true;

            if (supportsStreaming) {
                task = await this.getTaskStreaming(agentCard, headers, task.id, remaining);
            } else {
                task = await this.getTaskPolling(
                    agentCard,
                    headers,
                    task.id,
                    remaining,
                    this.getTaskPollInterval,
                );
            }
            await this.taskStore.save(task);
        }

        await this.saveTaskFiles(task);
        return task;
    }

    /**
     * Get the current state of a task, monitoring until terminal/actionable state.
     *
     * If the remote agent supports streaming, uses SSE resubscription for real-time
     * updates. Otherwise, polls at regular intervals.
     *
     * On monitoring timeout, returns the current task state (which may still be
     * non-terminal, e.g. "working"). The only errors from getTask are failed
     * HTTP requests (agent down, network error).
     *
     * @param agentId - Registered agent identifier.
     * @param taskId - Task ID from a previous sendMessage call.
     * @param opts.timeout - Total monitoring timeout in seconds. Defaults to
     *     getTaskTimeout from constructor.
     * @param opts.pollInterval - Interval between polls in seconds (used when streaming
     *     is not supported). Defaults to getTaskPollInterval from constructor.
     *
     * @returns Task with the current task state. If monitoring times out, the
     *     returned task may still be in a non-terminal state.
     *
     * @throws Error if agent is not found.
     */
    async getTask(
        agentId: string,
        taskId: string,
        opts?: {
            timeout?: number | null;
            pollInterval?: number | null;
        },
    ): Promise<Task> {
        const [agentCard, headers] = await this.resolveAgent(agentId);
        const effectiveTimeout =
            opts?.timeout !== undefined && opts?.timeout !== null
                ? opts.timeout
                : this.getTaskTimeout;
        const effectivePollInterval =
            opts?.pollInterval !== undefined && opts?.pollInterval !== null
                ? opts.pollInterval
                : this.getTaskPollInterval;

        const supportsStreaming =
            agentCard.capabilities !== undefined &&
            agentCard.capabilities !== null &&
            agentCard.capabilities.streaming === true;

        let task: Task;
        if (supportsStreaming) {
            task = await this.getTaskStreaming(agentCard, headers, taskId, effectiveTimeout);
        } else {
            task = await this.getTaskPolling(
                agentCard,
                headers,
                taskId,
                effectiveTimeout,
                effectivePollInterval,
            );
        }

        await this.taskStore.save(task);
        await this.saveTaskFiles(task);
        return task;
    }

    /**
     * Save file artifacts from a task to the file store if configured.
     *
     * Idempotent: skips artifacts whose files have already been saved.
     * Also saves files from the task's status message if present.
     */
    private async saveTaskFiles(task: Task): Promise<void> {
        if (this.fileStore === null) {
            return;
        }

        // Save artifact files
        if (task.artifacts) {
            for (const artifact of task.artifacts) {
                const hasFiles = artifact.parts.some((p) => p.kind === "file");
                if (hasFiles) {
                    const existing = await this.fileStore.getArtifact(task.id, artifact.artifactId);
                    if (existing.length === 0) {
                        await this.fileStore.saveArtifact(task.id, artifact);
                    }
                }
            }
        }

        // Save files from the status message
        if (task.status.message) {
            await this.saveMessageFiles(task.status.message as Message);
        }

        // Save files from history messages
        if (task.history) {
            for (const message of task.history) {
                await this.saveMessageFiles(message as Message);
            }
        }
    }

    /**
     * Save file parts from a message to the file store if configured.
     *
     * Idempotent: skips messages whose files have already been saved.
     */
    private async saveMessageFiles(message: Message): Promise<void> {
        if (this.fileStore === null) {
            return;
        }
        const hasFiles = message.parts.some((p) => p.kind === "file");
        if (hasFiles) {
            const existing = await this.fileStore.getMessage(message.messageId);
            if (existing.length === 0) {
                await this.fileStore.saveMessage(message);
            }
        }
    }

    /**
     * Build a file Part from a file path or URL.
     *
     * Local paths are read and encoded as FileWithBytes (max 1MB).
     * URLs are passed through as FileWithUri.
     */
    private async buildFilePart(fileRef: string): Promise<Part> {
        if (A2ASession.isUrl(fileRef)) {
            return {
                kind: "file",
                file: { uri: fileRef },
            } as Part;
        }

        const content = await fsSync.readFile(fileRef);
        if (content.length > A2ASession.MAX_FILE_SIZE) {
            const sizeMb = (content.length / 1_048_576).toFixed(1);
            throw new Error(
                `File '${fileRef}' is ${sizeMb}MB. Maximum size for file uploads is 1MB.`,
            );
        }
        const name = path.basename(fileRef);
        const mimeType = A2ASession.getMimeType(name);
        return {
            kind: "file",
            file: { name, mimeType, bytes: content.toString("base64") },
        } as Part;
    }

    /** Get MIME type from filename extension. */
    private static getMimeType(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
        return A2ASession.MIME_TYPES[ext] ?? "application/octet-stream";
    }

    /** Check if a string is an HTTP/HTTPS URL. */
    private static isUrl(value: string): boolean {
        return value.startsWith("http://") || value.startsWith("https://");
    }

    /** Monitor a task via SSE resubscription, falling back to a final fetch. */
    private async getTaskStreaming(
        agentCard: AgentCard,
        headers: Record<string, string>,
        taskId: string,
        timeout: number,
    ): Promise<Task> {
        const client = this.createClient(agentCard, headers);

        const params: TaskIdParams = { id: taskId };

        try {
            const stream = this.getSessionClient(client).resubscribeTask(params, {
                signal: AbortSignal.timeout(Math.round(timeout * 1000)),
            });

            for await (const event of stream) {
                if (event.kind === "status-update") {
                    const statusEvent = event as TaskStatusUpdateEvent;
                    if (TERMINAL_OR_ACTIONABLE_STATES.has(statusEvent.status.state)) {
                        break;
                    }
                } else if (event.kind === "task") {
                    const taskEvent = event as Task;
                    if (TERMINAL_OR_ACTIONABLE_STATES.has(taskEvent.status.state)) {
                        break;
                    }
                }
            }
        } catch (e) {
            if (e instanceof DOMException && e.name === "AbortError") {
                console.info(`Task ${taskId} still in working state after ${timeout}s`);
            } else {
                throw e;
            }
        }

        // Final fetch to get the complete Task with all artifacts
        return this.fetchTask(client, taskId, timeout);
    }

    /** Monitor a task by polling at regular intervals. */
    private async getTaskPolling(
        agentCard: AgentCard,
        headers: Record<string, string>,
        taskId: string,
        timeout: number,
        pollInterval: number,
    ): Promise<Task> {
        const client = this.createClient(agentCard, headers);
        const start = performance.now();

        while (true) {
            const task = await this.fetchTask(client, taskId, timeout);
            if (TERMINAL_OR_ACTIONABLE_STATES.has(task.status.state)) {
                return task;
            }
            const elapsed = (performance.now() - start) / 1000;
            if (elapsed >= timeout) {
                console.info(`Task ${taskId} still in working state after ${timeout}s`);
                return task;
            }
            await new Promise((resolve) => setTimeout(resolve, Math.round(pollInterval * 1000)));
        }
    }

    /** Fetch a task via A2AClient.getTask(). */
    private async fetchTask(client: A2AClient, taskId: string, timeout?: number): Promise<Task> {
        const response: GetTaskResponse = await this.getSessionClient(client).getTask(
            { id: taskId },
            timeout !== undefined
                ? { signal: AbortSignal.timeout(Math.round(timeout * 1000)) }
                : undefined,
        );

        if ("error" in response) {
            throw new Error(
                `JSON-RPC error: ${response.error.message} (code: ${response.error.code})`,
            );
        }

        return response.result as unknown as Task;
    }

    /** Narrow the SDK client to the methods this package relies on. */
    private getSessionClient(client: A2AClient): SessionClient {
        return client as unknown as SessionClient;
    }

    /** Create an A2AClient with optional custom headers. */
    private createClient(agentCard: AgentCard, headers: Record<string, string>): A2AClient {
        if (Object.keys(headers).length > 0) {
            const customHeaders = headers;
            const wrappedFetch: typeof fetch = (input, init?) => {
                const mergedInit = {
                    ...init,
                    headers: {
                        ...(init?.headers as Record<string, string>),
                        ...customHeaders,
                    },
                };
                return fetch(input, mergedInit);
            };
            wrappedFetch.preconnect = fetch.preconnect;
            return new A2AClient(agentCard, { fetchImpl: wrappedFetch });
        }
        return new A2AClient(agentCard);
    }

    /**
     * Resolve agent card and headers.
     *
     * @returns Tuple of [AgentCard, headers_dict].
     *
     * @throws Error if agent cannot be resolved.
     */
    private async resolveAgent(agentId: string): Promise<[AgentCard, Record<string, string>]> {
        const agent = await this.agents.getAgent(agentId);
        if (agent === null) {
            const agents = await this.agents.getAgents();
            const available = Object.keys(agents).sort().join(", ");
            throw new Error(`Agent '${agentId}' not found. Available agents: ${available}`);
        }
        return [agent.agentCard, agent.customHeaders];
    }
}

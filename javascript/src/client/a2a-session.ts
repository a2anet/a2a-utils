// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * A2ASession — main interface for interacting with A2A agents.
 */

import type {
    AgentCard,
    GetTaskResponse,
    Message,
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
import type { AgentManager } from "./agent-manager.js";

function sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

/** Main interface for sending messages to A2A agents. */
export class A2ASession {
    readonly agentManager: AgentManager;
    readonly taskStore: TaskStore;
    readonly fileStore: FileStore | null;
    private readonly sendMessageTimeout: number;
    private readonly getTaskTimeout: number;
    private readonly getTaskPollInterval: number;

    constructor(
        agentManager: AgentManager,
        opts?: {
            taskStore?: TaskStore;
            fileStore?: FileStore | null;
            sendMessageTimeout?: number;
            getTaskTimeout?: number;
            getTaskPollInterval?: number;
        },
    ) {
        this.agentManager = agentManager;
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
        },
    ): Promise<Task | Message> {
        const [agentCard, headers] = await this.resolveAgent(agentId);

        const contextId = opts?.contextId ?? uuidv4();

        // Build A2A message
        const a2aMessage: Message = {
            kind: "message",
            messageId: uuidv4(),
            parts: [{ kind: "text", text: message }],
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
        const response: SendMessageResponse = await (client as any).sendMessage(
            {
                message: a2aMessage,
                configuration: { blocking: false },
            },
            { signal: AbortSignal.timeout(effectiveTimeout * 1000) },
        );

        if ("error" in response) {
            throw new Error(
                `JSON-RPC error: ${response.error.message} (code: ${response.error.code})`,
            );
        }

        const result = response.result;

        // Handle Message result
        if (result.kind === "message") {
            return result as unknown as Message;
        }

        // Handle Task result
        if (result.kind !== "task") {
            throw new Error("Expected Task or Message response, got unexpected kind");
        }

        let task = result as unknown as Task;
        await this.taskStore.save(task);

        // If task is already in a terminal/actionable state, save files and return
        if (TERMINAL_OR_ACTIONABLE_STATES.has(task.status.state)) {
            await this.saveFiles(task);
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

        await this.saveFiles(task);
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
        await this.saveFiles(task);
        return task;
    }

    /**
     * Save file artifacts to the file store if configured.
     *
     * Idempotent: skips artifacts whose files have already been saved.
     */
    private async saveFiles(task: Task): Promise<void> {
        if (this.fileStore === null || !task.artifacts) {
            return;
        }

        for (const artifact of task.artifacts) {
            const hasFiles = artifact.parts.some((p) => p.kind === "file");
            if (hasFiles) {
                const existing = await this.fileStore.get(task.id, artifact.artifactId);
                if (existing.length === 0) {
                    await this.fileStore.save(task.id, artifact);
                }
            }
        }
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
            const stream = (client as any).resubscribeTask(params, {
                signal: AbortSignal.timeout(timeout * 1000),
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
            await sleep(pollInterval);
        }
    }

    /** Fetch a task via A2AClient.getTask(). */
    private async fetchTask(client: A2AClient, taskId: string, timeout?: number): Promise<Task> {
        const response: GetTaskResponse = await (client as any).getTask(
            { id: taskId },
            timeout !== undefined ? { signal: AbortSignal.timeout(timeout * 1000) } : undefined,
        );

        if ("error" in response) {
            throw new Error(
                `JSON-RPC error: ${response.error.message} (code: ${response.error.code})`,
            );
        }

        return response.result as unknown as Task;
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
        const agent = await this.agentManager.getAgent(agentId);
        if (agent === null) {
            const agents = await this.agentManager.getAgents();
            const available = Object.keys(agents).sort().join(", ");
            throw new Error(`Agent '${agentId}' not found. Available agents: ${available}`);
        }
        return [agent.agentCard, agent.customHeaders];
    }
}

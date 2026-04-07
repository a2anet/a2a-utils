// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import type {
    AgentCard,
    GetTaskResponse,
    Message,
    SendMessageResponse,
    Task,
    TaskState,
} from "@a2a-js/sdk";
import { A2AClient, DefaultAgentCardResolver } from "@a2a-js/sdk/client";

const TERMINAL_OR_ACTIONABLE_STATES = new Set<TaskState>([
    "completed",
    "failed",
    "canceled",
    "rejected",
    "input-required",
    "auth-required",
]);

function getResultOrThrow(response: SendMessageResponse | GetTaskResponse): Task | Message {
    if ("error" in response) {
        throw new Error(`JSON-RPC error: ${response.error.message}`);
    }

    return response.result;
}

function withApiKey(fetchImpl: typeof fetch): typeof fetch {
    return (input, init) =>
        fetchImpl(input, {
            ...init,
            headers: {
                ...(init?.headers as Record<string, string> | undefined),
                "X-API-Key": "key_123",
            },
        });
}

async function rawA2AClientExample(fetchImpl: typeof fetch): Promise<Task | Message> {
    const fetchWithApiKey = withApiKey(fetchImpl);

    // 1. Resolve the Agent Card
    const resolver = new DefaultAgentCardResolver({ fetchImpl: fetchWithApiKey });
    const agentCard = await resolver.resolve("https://research.example.com");

    // 2. Build the Message
    const message = {
        kind: "message",
        messageId: crypto.randomUUID(),
        parts: [{ kind: "text", text: "Find recent papers on quantum computing" }],
        role: "user",
    } satisfies Message;

    // 3. Send the Message (non-blocking)
    const client = new A2AClient(agentCard, { fetchImpl: fetchWithApiKey });
    const response = await client.sendMessage({
        message,
        configuration: { blocking: false },
    });

    const taskOrMessage = getResultOrThrow(response);
    if (taskOrMessage.kind === "message") {
        return taskOrMessage;
    }

    let task = taskOrMessage;
    // 4. Poll until the Task reaches a terminal state
    while (!TERMINAL_OR_ACTIONABLE_STATES.has(task.status.state)) {
        const taskResponse = await client.getTask({ id: task.id });
        const result = getResultOrThrow(taskResponse);
        if (result.kind !== "task") {
            throw new Error(`Expected Task response, got ${result.kind}`);
        }
        task = result;
    }

    return task;
}

function agentCard(): AgentCard {
    return {
        name: "Research Bot",
        description: "Find and summarize research papers",
        url: "https://research.example.com/api",
        version: "1.0.0",
        protocolVersion: "0.3.0",
        capabilities: {},
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain"],
        skills: [
            {
                id: "research",
                name: "Research",
                description: "Find recent papers",
                tags: ["research"],
            },
        ],
    };
}

function task(state: TaskState): Task {
    return {
        id: "task-1",
        contextId: "ctx-1",
        kind: "task",
        status: { state },
        artifacts: [],
    };
}

describe("raw A2A client example", () => {
    test("polls until completed", async () => {
        let getTaskCalls = 0;

        const fetchImpl: typeof fetch = async (input, init) => {
            const url = input.toString();
            expect(init?.headers).toMatchObject({ "X-API-Key": "key_123" });

            if (url === "https://research.example.com/.well-known/agent-card.json") {
                return Response.json(agentCard());
            }

            const body = JSON.parse(String(init?.body)) as {
                id: string | number;
                method: string;
                params: Record<string, unknown>;
            };

            if (body.method === "message/send") {
                expect(url).toBe("https://research.example.com/api");
                expect(body.params.configuration).toMatchObject({ blocking: false });
                expect(body.params.message).toMatchObject({
                    parts: [{ kind: "text", text: "Find recent papers on quantum computing" }],
                    role: "user",
                });
                return Response.json({ id: body.id, jsonrpc: "2.0", result: task("working") });
            }

            if (body.method === "tasks/get") {
                getTaskCalls += 1;
                expect(body.params).toMatchObject({ id: "task-1" });
                return Response.json({ id: body.id, jsonrpc: "2.0", result: task("completed") });
            }

            throw new Error(`Unexpected request: ${body.method}`);
        };

        const result = await rawA2AClientExample(fetchImpl);

        expect(result.kind).toBe("task");
        expect((result as Task).status.state).toBe("completed");
        expect(getTaskCalls).toBe(1);
    });
});

// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, spyOn, test } from "bun:test";
import type { Message, Task } from "@a2a-js/sdk";
import { A2AAgents, A2ASession, TERMINAL_OR_ACTIONABLE_STATES } from "../src/index.js";

async function a2aSessionExample(): Promise<Task | Message> {
    const a2aAgents = new A2AAgents({
        "research-bot": {
            url: "https://research.example.com/.well-known/agent-card.json",
            custom_headers: { "X-API-Key": "key_123" },
        },
    });

    const session = new A2ASession(a2aAgents);

    let response = await session.sendMessage(
        "research-bot",
        "Find recent papers on quantum computing",
    );

    if (response.kind === "message") {
        return response;
    }

    while (!TERMINAL_OR_ACTIONABLE_STATES.has(response.status.state)) {
        response = await session.getTask("research-bot", response.id);
    }

    return response;
}

function task(state: Task["status"]["state"]): Task {
    return {
        id: "task-1",
        contextId: "ctx-1",
        kind: "task",
        status: { state },
        artifacts: [],
    };
}

describe("A2ASession example", () => {
    test("polls until completed", async () => {
        let getTaskCalls = 0;

        const sendMessage = spyOn(A2ASession.prototype, "sendMessage").mockImplementation(
            async function (this: A2ASession, agentId: string, message: string): Promise<Task> {
                expect(this.agents).toBeInstanceOf(A2AAgents);
                expect(agentId).toBe("research-bot");
                expect(message).toBe("Find recent papers on quantum computing");
                return task("working");
            },
        );

        const getTask = spyOn(A2ASession.prototype, "getTask").mockImplementation(async function (
            this: A2ASession,
            agentId: string,
            taskId: string,
        ): Promise<Task> {
            expect(this.agents).toBeInstanceOf(A2AAgents);
            expect(agentId).toBe("research-bot");
            expect(taskId).toBe("task-1");
            getTaskCalls += 1;
            return task("completed");
        });

        try {
            const result = await a2aSessionExample();

            expect(result.kind).toBe("task");
            expect((result as Task).status.state).toBe("completed");
            expect(getTaskCalls).toBe(1);
        } finally {
            sendMessage.mockRestore();
            getTask.mockRestore();
        }
    });
});

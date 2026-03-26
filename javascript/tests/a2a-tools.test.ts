// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, spyOn, test } from "bun:test";
import type { AgentCard, Artifact, Message, Task } from "@a2a-js/sdk";
import { A2AAgents } from "../src/client/a2a-agents.js";
import { A2ASession } from "../src/client/a2a-session.js";
import { A2ATools } from "../src/client/a2a-tools.js";
import { ArtifactSettings } from "../src/types.js";
import { getA2AAgentsInternals, getToolsInternals, getToolsStatics } from "./internal-access.js";

const toolsStatics = getToolsStatics(A2ATools);

function makeManager(): A2AAgents {
    const manager = new A2AAgents(null);
    getA2AAgentsInternals(manager).initialized = true;
    return manager;
}

function makeSession(): A2ASession {
    return new A2ASession(makeManager());
}

function makeTools(session?: A2ASession): A2ATools {
    return new A2ATools(session ?? makeSession());
}

describe("A2ATools init", () => {
    test("default artifact settings", () => {
        const tools = makeTools();
        const internals = getToolsInternals(tools);
        expect(internals.artifactSettings.sendMessageCharacterLimit).toBe(50_000);
        expect(internals.artifactSettings.minimizedObjectStringLength).toBe(5_000);
        expect(internals.artifactSettings.viewArtifactCharacterLimit).toBe(50_000);
    });

    test("custom artifact settings", () => {
        const settings = new ArtifactSettings({
            sendMessageCharacterLimit: 100_000,
            minimizedObjectStringLength: 10_000,
            viewArtifactCharacterLimit: 75_000,
        });
        const tools = new A2ATools(makeSession(), { artifactSettings: settings });
        const internals = getToolsInternals(tools);
        expect(internals.artifactSettings.sendMessageCharacterLimit).toBe(100_000);
        expect(internals.artifactSettings.minimizedObjectStringLength).toBe(10_000);
        expect(internals.artifactSettings.viewArtifactCharacterLimit).toBe(75_000);
    });

    test("session reference", () => {
        const session = makeSession();
        const tools = new A2ATools(session);
        expect(getToolsInternals(tools).session).toBe(session);
    });
});

describe("getAgents", () => {
    test("returns dict", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session.agents, "getAgentsForLlm").mockResolvedValue({
            "agent-a": { name: "Agent A", description: "Does A things" },
        });
        const result = await tools.getAgents();
        expect(result["agent-a"]).toBeDefined();
        expect((result["agent-a"] as Record<string, unknown>).name).toBe("Agent A");
    });

    test("empty with init errors", async () => {
        const tools = makeTools();
        const managerInternals = getA2AAgentsInternals(getToolsInternals(tools).session.agents);
        spyOn(managerInternals, "getAgentsForLlm").mockResolvedValue({});
        managerInternals.initErrors = {
            "bad-agent": "ConnectionError: refused",
        };
        const result = await tools.getAgents();
        expect(result.agents).toEqual({});
        expect((result.errors as Record<string, string>)["bad-agent"]).toContain(
            "Failed to load agent",
        );
    });

    test("error returns dict with error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session.agents, "getAgentsForLlm").mockRejectedValue(
            new Error("boom"),
        );
        const result = await tools.getAgents();
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("boom");
    });
});

describe("getAgent", () => {
    test("returns agent details", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session.agents, "getAgentForLlm").mockResolvedValue({
            name: "Agent A",
            description: "Does A things",
            skills: [{ name: "search", description: "Search the web" }],
        });
        const result = await tools.getAgent("agent-a");
        expect(result.name).toBe("Agent A");
        expect((result.skills as unknown[]).length).toBe(1);
    });

    test("not found returns actionable error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session.agents, "getAgentForLlm").mockResolvedValue(null);
        spyOn(getToolsInternals(tools).session.agents, "getAgents").mockResolvedValue({
            "agent-b": { agentCard: {} as unknown as AgentCard, customHeaders: {} },
        });
        const result = await tools.getAgent("nonexistent");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("not found");
        expect(result.error_message).toContain("get_agents");
        expect(result.error_message).toContain("agent-b");
    });

    test("error returns dict with error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session.agents, "getAgentForLlm").mockRejectedValue(
            new Error("kaboom"),
        );
        const result = await tools.getAgent("agent-a");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("kaboom");
    });
});

describe("sendMessage", () => {
    test("returns serialized task", async () => {
        const tools = makeTools();
        const task: Task = {
            id: "task-1",
            contextId: "ctx-1",
            kind: "task",
            status: { state: "completed" },
            artifacts: [],
        };
        spyOn(getToolsInternals(tools).session, "sendMessage").mockResolvedValue(task);
        const result = await tools.sendMessage("agent-a", "hello");
        expect(result.id).toBe("task-1");
        expect(result.kind).toBe("task");
        expect((result.status as Record<string, unknown>).state).toBe("completed");
    });

    test("returns serialized message", async () => {
        const tools = makeTools();
        const msg: Message = {
            contextId: "ctx-1",
            kind: "message",
            messageId: "msg-1",
            parts: [{ kind: "text", text: "Hi there" }],
            role: "agent",
        };
        spyOn(getToolsInternals(tools).session, "sendMessage").mockResolvedValue(msg);
        const result = await tools.sendMessage("agent-a", "hello");
        expect(result.kind).toBe("message");
        expect((result.parts as unknown[])[0]).toEqual({ kind: "text", text: "Hi there" });
    });

    test("agent not found error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session, "sendMessage").mockRejectedValue(
            new Error("Agent 'bad' not found. Available agents: agent-a"),
        );
        const result = await tools.sendMessage("bad", "hello");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("not found");
        expect(result.error_message).toContain("get_agents");
    });

    test("timeout error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session, "sendMessage").mockRejectedValue(
            new DOMException("The operation timed out.", "TimeoutError"),
        );
        const result = await tools.sendMessage("agent-a", "hello");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("timed out");
    });

    test("generic error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session, "sendMessage").mockRejectedValue(
            new Error("network error"),
        );
        const result = await tools.sendMessage("agent-a", "hello");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("network error");
    });
});

describe("getTask", () => {
    test("returns serialized task", async () => {
        const tools = makeTools();
        const task: Task = {
            id: "task-1",
            contextId: "ctx-1",
            kind: "task",
            status: { state: "working" },
            artifacts: [],
        };
        spyOn(getToolsInternals(tools).session, "getTask").mockResolvedValue(task);
        const result = await tools.getTask("agent-a", "task-1");
        expect(result.id).toBe("task-1");
        expect((result.status as Record<string, unknown>).state).toBe("working");
    });

    test("agent not found error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session, "getTask").mockRejectedValue(
            new Error("Agent 'bad' not found"),
        );
        const result = await tools.getTask("bad", "task-1");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("not found");
        expect(result.error_message).toContain("get_agents");
    });

    test("timeout error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools).session, "getTask").mockRejectedValue(
            new DOMException("The operation timed out.", "TimeoutError"),
        );
        const result = await tools.getTask("agent-a", "task-1");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("timed out");
    });
});

describe("viewTextArtifact", () => {
    test("returns serialized artifact", async () => {
        const tools = makeTools();
        const artifact: Artifact = {
            artifactId: "art-1",
            description: "A document",
            name: "doc.txt",
            parts: [{ kind: "text", text: "line1\nline2" }],
        };
        spyOn(getToolsInternals(tools), "getArtifact").mockResolvedValue(artifact);
        const result = await tools.viewTextArtifact("agent-a", "task-1", "art-1");
        expect(result.artifactId).toBe("art-1");
        const parts = result.parts as unknown[];
        expect((parts[0] as Record<string, unknown>).text).toBe("line1\nline2");
    });

    test("artifact not found error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools), "getArtifact").mockRejectedValue(
            new Error("Artifact 'art-x' not found in task 'task-1'"),
        );
        const result = await tools.viewTextArtifact("agent-a", "task-1", "art-x");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("art-x");
        expect(result.error_message).toContain("task-1");
    });

    test("no text content error", async () => {
        const tools = makeTools();
        const artifact: Artifact = {
            artifactId: "art-1",
            parts: [{ kind: "data", data: { key: "value" } }],
        };
        spyOn(getToolsInternals(tools), "getArtifact").mockResolvedValue(artifact);
        const result = await tools.viewTextArtifact("agent-a", "task-1", "art-1");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("does not contain text");
    });
});

describe("viewDataArtifact", () => {
    test("returns serialized artifact", async () => {
        const tools = makeTools();
        const artifact: Artifact = {
            artifactId: "art-1",
            description: "data",
            name: "results",
            parts: [{ kind: "data", data: { key: "value" } }],
        };
        spyOn(getToolsInternals(tools), "getArtifact").mockResolvedValue(artifact);
        const result = await tools.viewDataArtifact("agent-a", "task-1", "art-1");
        expect(result.artifactId).toBe("art-1");
        const parts = result.parts as unknown[];
        expect((parts[0] as Record<string, unknown>).data).toEqual({ key: "value" });
    });

    test("with rows and columns", async () => {
        const tools = makeTools();
        const artifact: Artifact = {
            artifactId: "art-1",
            parts: [
                {
                    kind: "data",
                    data: {
                        employees: [
                            { name: "Alice", age: 30 },
                            { name: "Bob", age: 25 },
                        ],
                    },
                },
            ],
        };
        spyOn(getToolsInternals(tools), "getArtifact").mockResolvedValue(artifact);
        const result = await tools.viewDataArtifact(
            "agent-a",
            "task-1",
            "art-1",
            "employees",
            "0",
            "name",
        );
        const parts = result.parts as unknown[];
        expect((parts[0] as Record<string, unknown>).data).toEqual([{ name: "Alice" }]);
    });

    test("artifact not found error", async () => {
        const tools = makeTools();
        spyOn(getToolsInternals(tools), "getArtifact").mockRejectedValue(
            new Error("Artifact 'art-x' not found in task 'task-1'"),
        );
        const result = await tools.viewDataArtifact("agent-a", "task-1", "art-x");
        expect(result.error).toBe(true);
        expect(result.error_message).toContain("art-x");
    });
});

describe("parseRows", () => {
    test("none", () => {
        expect(toolsStatics.parseRows(null)).toBeNull();
    });

    test("all", () => {
        expect(toolsStatics.parseRows("all")).toBe("all");
    });

    test("single int", () => {
        expect(toolsStatics.parseRows("0")).toBe(0);
        expect(toolsStatics.parseRows("5")).toBe(5);
    });

    test("range", () => {
        expect(toolsStatics.parseRows("0-10")).toBe("0-10");
    });

    test("comma separated", () => {
        expect(toolsStatics.parseRows("0,2,5")).toEqual([0, 2, 5]);
    });

    test("comma separated with spaces", () => {
        expect(toolsStatics.parseRows("0, 2, 5")).toEqual([0, 2, 5]);
    });

    test("whitespace stripped", () => {
        expect(toolsStatics.parseRows("  3  ")).toBe(3);
    });

    test("invalid comma separated", () => {
        expect(() => toolsStatics.parseRows("a,b,c")).toThrow("integers");
    });

    test("invalid string", () => {
        expect(() => toolsStatics.parseRows("abc")).toThrow("Invalid rows format");
    });
});

describe("parseColumns", () => {
    test("none", () => {
        expect(toolsStatics.parseColumns(null)).toBeNull();
    });

    test("all", () => {
        expect(toolsStatics.parseColumns("all")).toBe("all");
    });

    test("single column", () => {
        expect(toolsStatics.parseColumns("name")).toBe("name");
    });

    test("comma separated", () => {
        expect(toolsStatics.parseColumns("name,age")).toEqual(["name", "age"]);
    });

    test("comma separated with spaces", () => {
        expect(toolsStatics.parseColumns("name, age, email")).toEqual(["name", "age", "email"]);
    });

    test("whitespace stripped", () => {
        expect(toolsStatics.parseColumns("  name  ")).toBe("name");
    });
});

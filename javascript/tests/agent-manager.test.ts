// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, spyOn, test } from "bun:test";
import type { AgentCard, AgentSkill } from "@a2a-js/sdk";
import { AgentManager } from "../src/client/agent-manager.js";
import type { AgentURLAndCustomHeaders } from "../src/types.js";

function makeCard(
    name: string,
    description: string,
    skills: { name: string; description?: string }[],
): AgentCard {
    return {
        name,
        description,
        url: "https://example.com",
        version: "1.0",
        protocolVersion: "0.2.0",
        capabilities: {},
        defaultInputModes: ["text/plain"],
        defaultOutputModes: ["text/plain"],
        skills: skills.map((s) => ({
            id: s.name,
            name: s.name,
            description: s.description ?? "",
        })) as AgentSkill[],
    } as AgentCard;
}

describe("constructor", () => {
    test("none config", () => {
        const manager = new AgentManager(null);
        expect((manager as any).config).toEqual({});
        expect((manager as any).agents).toEqual({});
    });

    test("dict config", () => {
        const config = { "my-agent": { url: "https://example.com/agent-card.json" } };
        const manager = new AgentManager(config);
        expect((manager as any).config["my-agent"]).toBeDefined();
        expect((manager as any).config["my-agent"].url).toBe("https://example.com/agent-card.json");
    });

    test("empty dict", () => {
        const manager = new AgentManager({});
        expect((manager as any).config).toEqual({});
    });

    test("stores custom timeout", () => {
        const manager = new AgentManager(null, { timeout: 7.5 });
        expect((manager as any).timeout).toBe(7.5);
    });
});

describe("getAgent", () => {
    test("not found", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        expect(await manager.getAgent("nonexistent")).toBeNull();
    });

    test("found", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test", "Desc", []);
        (manager as any).agents["my-agent"] = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgent("my-agent");
        expect(result).not.toBeNull();
        expect(result?.agentCard).toBe(card);
    });
});

describe("getAgents", () => {
    test("empty", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        expect(await manager.getAgents()).toEqual({});
    });

    test("returns copy", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test", "Desc", []);
        (manager as any).agents.a = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgents();
        expect(result.a).toBeDefined();
        // Verify it's a copy
        result.b = { agentCard: card, customHeaders: {} };
        expect((manager as any).agents.b).toBeUndefined();
    });
});

describe("getAgentsForLlm", () => {
    test("no agents", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        expect(await manager.getAgentsForLlm()).toEqual({});
    });

    test("name detail", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test Agent", "A test", [{ name: "search" }]);
        (manager as any).agents.test = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgentsForLlm("name");
        expect(result).toEqual({ test: { name: "Test Agent" } });
    });

    test("basic detail", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test Agent", "A test", []);
        (manager as any).agents.test = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgentsForLlm("basic");
        expect(result).toEqual({
            test: { name: "Test Agent", description: "A test" },
        });
    });

    test("skills detail", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test", "Desc", [{ name: "search", description: "Find things" }]);
        (manager as any).agents.test = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgentsForLlm("skills");
        expect(result).toEqual({
            test: { name: "Test", description: "Desc", skills: ["search"] },
        });
    });

    test("full detail", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test", "Desc", [{ name: "search", description: "Find things" }]);
        (manager as any).agents.test = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgentsForLlm("full");
        expect(result).toEqual({
            test: {
                name: "Test",
                description: "Desc",
                skills: [{ name: "search", description: "Find things" }],
            },
        });
    });

    test("default is basic", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test Agent", "A test", [{ name: "search" }]);
        (manager as any).agents.test = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgentsForLlm();
        expect(result).toEqual({
            test: { name: "Test Agent", description: "A test" },
        });
    });

    test("sorted by agent id", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const cardB = makeCard("B Agent", "Agent B", []);
        const cardA = makeCard("A Agent", "Agent A", []);
        (manager as any).agents["z-agent"] = { agentCard: cardB, customHeaders: {} };
        (manager as any).agents["a-agent"] = { agentCard: cardA, customHeaders: {} };

        const result = await manager.getAgentsForLlm("name");
        expect(Object.keys(result)).toEqual(["a-agent", "z-agent"]);
        expect(result["a-agent"].name).toBe("A Agent");
        expect(result["z-agent"].name).toBe("B Agent");
    });
});

describe("getAgentForLlm", () => {
    test("not found", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        expect(await manager.getAgentForLlm("nonexistent")).toBeNull();
    });

    test("default is basic", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test", "Desc", []);
        (manager as any).agents.test = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgentForLlm("test");
        expect(result).toEqual({ name: "Test", description: "Desc" });
    });

    test("name detail", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test", "Desc", []);
        (manager as any).agents.test = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgentForLlm("test", "name");
        expect(result).toEqual({ name: "Test" });
    });

    test("skills detail", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test", "Desc", [{ name: "search", description: "Find things" }]);
        (manager as any).agents.test = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgentForLlm("test", "skills");
        expect(result).toEqual({
            name: "Test",
            description: "Desc",
            skills: ["search"],
        });
    });

    test("full detail", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test", "Desc", [{ name: "search", description: "Find things" }]);
        (manager as any).agents.test = { agentCard: card, customHeaders: {} };

        const result = await manager.getAgentForLlm("test", "full");
        expect(result).toEqual({
            name: "Test",
            description: "Desc",
            skills: [{ name: "search", description: "Find things" }],
        });
    });
});

describe("addAgent", () => {
    test("add agent success", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;

        const card = makeCard("New Agent", "A new agent", []);
        spyOn(manager as any, "fetchAgent").mockImplementation(
            async (agentId: string, config: Record<string, unknown>) => {
                (manager as any).agents[agentId] = {
                    agentCard: card,
                    customHeaders: (config.custom_headers as Record<string, string>) ?? {},
                };
            },
        );

        await manager.addAgent("new-agent", "https://example.com/card.json");

        const result = await manager.getAgent("new-agent");
        expect(result).not.toBeNull();
        expect(result?.agentCard).toBe(card);
    });

    test("add agent with custom headers", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;

        const card = makeCard("New Agent", "A new agent", []);
        const fetchSpy = spyOn(manager as any, "fetchAgent").mockImplementation(
            async (agentId: string, config: Record<string, unknown>) => {
                (manager as any).agents[agentId] = {
                    agentCard: card,
                    customHeaders: (config.custom_headers as Record<string, string>) ?? {},
                };
            },
        );

        await manager.addAgent("new-agent", "https://example.com/card.json", {
            "X-API-Key": "secret",
        });

        expect(fetchSpy).toHaveBeenCalledWith("new-agent", {
            url: "https://example.com/card.json",
            custom_headers: { "X-API-Key": "secret" },
        });
    });

    test("add agent duplicate raises", async () => {
        const manager = new AgentManager(null);
        (manager as any).initialized = true;
        const card = makeCard("Test", "Desc", []);
        (manager as any).agents.existing = { agentCard: card, customHeaders: {} };

        await expect(manager.addAgent("existing", "https://example.com/card.json")).rejects.toThrow(
            "already registered",
        );
    });

    test("add agent triggers lazy init", async () => {
        const manager = new AgentManager(null);
        expect((manager as any).initialized).toBe(false);

        // Mock _fetchAgent to avoid real network calls
        (manager as any).fetchAgent = async () => {};
        await manager.addAgent("new-agent", "https://example.com/card.json");
        expect((manager as any).initialized).toBe(true);
    });
});

describe("lazy init", () => {
    test("ensure initialized called on get agent", async () => {
        const manager = new AgentManager(null);
        expect((manager as any).initialized).toBe(false);
        await manager.getAgent("nonexistent");
        expect((manager as any).initialized).toBe(true);
    });

    test("ensure initialized called on get agents", async () => {
        const manager = new AgentManager(null);
        expect((manager as any).initialized).toBe(false);
        await manager.getAgents();
        expect((manager as any).initialized).toBe(true);
    });

    test("ensure initialized called on get agent for llm", async () => {
        const manager = new AgentManager(null);
        expect((manager as any).initialized).toBe(false);
        await manager.getAgentForLlm("nonexistent");
        expect((manager as any).initialized).toBe(true);
    });

    test("ensure initialized called on get agents for llm", async () => {
        const manager = new AgentManager(null);
        expect((manager as any).initialized).toBe(false);
        await manager.getAgentsForLlm();
        expect((manager as any).initialized).toBe(true);
    });

    test("idempotent", async () => {
        const manager = new AgentManager(null);
        await (manager as any).ensureInitialized();
        expect((manager as any).initialized).toBe(true);
        await (manager as any).ensureInitialized();
        expect((manager as any).initialized).toBe(true);
    });
});

describe("fetch wrapper", () => {
    test("applies timeout and custom headers", async () => {
        const manager = new AgentManager(null, { timeout: 7.5 });
        const originalFetch = globalThis.fetch;
        const fetchCalls: RequestInit[] = [];

        globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
            fetchCalls.push(init ?? {});
            return new Response("{}");
        }) as typeof fetch;
        globalThis.fetch.preconnect = originalFetch.preconnect;

        try {
            const wrappedFetch = (manager as any).createFetchImpl({ Authorization: "Bearer token" });
            await wrappedFetch("https://example.com", {
                headers: { Accept: "application/json" },
            });
        } finally {
            globalThis.fetch = originalFetch;
        }

        expect(fetchCalls.length).toBe(1);
        expect(fetchCalls[0].signal).toBeDefined();
        expect((fetchCalls[0].headers as Record<string, string>).Accept).toBe("application/json");
        expect((fetchCalls[0].headers as Record<string, string>).Authorization).toBe(
            "Bearer token",
        );
    });

    test("combines caller signal with timeout", async () => {
        const manager = new AgentManager(null, { timeout: 7.5 });
        const originalFetch = globalThis.fetch;
        const fetchCalls: RequestInit[] = [];
        const controller = new AbortController();

        globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
            fetchCalls.push(init ?? {});
            return new Response("{}");
        }) as typeof fetch;
        globalThis.fetch.preconnect = originalFetch.preconnect;

        try {
            const wrappedFetch = (manager as any).createFetchImpl({});
            await wrappedFetch("https://example.com", { signal: controller.signal });
        } finally {
            globalThis.fetch = originalFetch;
        }

        expect(fetchCalls.length).toBe(1);
        expect(fetchCalls[0].signal).toBeDefined();
        expect(fetchCalls[0].signal).not.toBe(controller.signal);
    });
});

// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { A2AAgents, A2ASession, A2ATools, JSONTaskStore, LocalFileStore } from "../src/index.js";

function langchainToolsExample(storageDir: string): {
    a2aTools: A2ATools;
    agent: ReturnType<typeof createAgent>;
    langchainTools: ReturnType<typeof tool>[];
} {
    const a2aAgents = new A2AAgents({
        weather: { url: "https://weather.example.com/.well-known/agent-card.json" },
        "research-bot": {
            url: "https://research.example.com/.well-known/agent-card.json",
            custom_headers: { "X-API-Key": "key_123" },
        },
    });

    const a2aSession = new A2ASession(a2aAgents, {
        taskStore: new JSONTaskStore(path.join(storageDir, "tasks")),
        fileStore: new LocalFileStore(path.join(storageDir, "files")),
    });

    const a2aTools = new A2ATools(a2aSession);

    const langchainTools = a2aTools.tools.map((def) =>
        tool(def.execute, { name: def.name, description: def.description, schema: def.schema }),
    );

    const model = new ChatOpenAI({
        model: "gpt-5.1",
        reasoning: { effort: "medium" },
        apiKey: "test",
    });

    const agent = createAgent({ model, tools: langchainTools });

    return { a2aTools, agent, langchainTools };
}

describe("LangChain tools example", () => {
    test("maps A2ATools.tools to framework tool definitions", () => {
        const storageDir = mkdtempSync(path.join(tmpdir(), "a2a-utils-example-"));

        try {
            const { a2aTools, agent, langchainTools } = langchainToolsExample(storageDir);

            expect(typeof agent.invoke).toBe("function");
            expect(langchainTools.map((def) => def.name)).toEqual(
                a2aTools.tools.map((def) => def.name),
            );
            expect(langchainTools[0].name).toBe("get_agents");
        } finally {
            rmSync(storageDir, { recursive: true, force: true });
        }
    });
});

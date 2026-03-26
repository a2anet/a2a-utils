// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { InMemoryTaskStore, type TaskStore } from "@a2a-js/sdk/server";
import { TextArtifacts } from "../src/artifacts/text.js";
import { A2ASession } from "../src/client/a2a-session.js";
import { A2AAgents } from "../src/client/a2a-agents.js";
import { JSONTaskStore } from "../src/tasks/json-task-store.js";
import { getA2AAgentsInternals, getSessionInternals } from "./internal-access.js";

function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "a2a-test-"));
}

describe("A2ASession init", () => {
    test("with components", () => {
        const tmpDir = makeTmpDir();
        try {
            const manager = new A2AAgents(null);
            const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
            const session = new A2ASession(manager, { taskStore: store });
            expect(session.agents).toBe(manager);
            expect(session.taskStore).toBe(store);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    test("default task store is in memory", () => {
        const manager = new A2AAgents(null);
        const session = new A2ASession(manager);
        expect(session.taskStore).toBeInstanceOf(InMemoryTaskStore);
    });

    test("custom task store", () => {
        const manager = new A2AAgents(null);
        const store: TaskStore = {
            save: async () => {},
            load: async () => undefined,
        };
        const session = new A2ASession(manager, { taskStore: store });
        expect(session.taskStore).toBe(store);
    });

    test("file store default none", () => {
        const manager = new A2AAgents(null);
        const session = new A2ASession(manager);
        expect(session.fileStore).toBeNull();
    });

    test("default timeouts", () => {
        const manager = new A2AAgents(null);
        const session = new A2ASession(manager);
        const internals = getSessionInternals(session);
        expect(internals.sendMessageTimeout).toBe(60.0);
        expect(internals.getTaskTimeout).toBe(60.0);
        expect(internals.getTaskPollInterval).toBe(5.0);
    });

    test("custom timeouts", () => {
        const manager = new A2AAgents(null);
        const session = new A2ASession(manager, {
            sendMessageTimeout: 120.0,
            getTaskTimeout: 30.0,
            getTaskPollInterval: 2.0,
        });
        const internals = getSessionInternals(session);
        expect(internals.sendMessageTimeout).toBe(120.0);
        expect(internals.getTaskTimeout).toBe(30.0);
        expect(internals.getTaskPollInterval).toBe(2.0);
    });
});

describe("send message validation", () => {
    test("agent id not found", async () => {
        const manager = new A2AAgents(null);
        getA2AAgentsInternals(manager).initialized = true;
        const session = new A2ASession(manager);
        await expect(session.sendMessage("nonexistent", "hello")).rejects.toThrow("not found");
    });
});

describe("get task validation", () => {
    test("agent id not found", async () => {
        const manager = new A2AAgents(null);
        getA2AAgentsInternals(manager).initialized = true;
        const session = new A2ASession(manager);
        await expect(session.getTask("nonexistent", "task-123")).rejects.toThrow("not found");
    });
});

describe("TextArtifacts.view", () => {
    test("line selection", () => {
        const text = "line1\nline2\nline3\nline4";
        const result = TextArtifacts.view(text, { lineStart: 2, lineEnd: 3 });
        expect(result).toBe("line2\nline3");
    });

    test("character selection", () => {
        const text = "Hello, World!";
        const result = TextArtifacts.view(text, { characterStart: 0, characterEnd: 5 });
        expect(result).toBe("Hello");
    });

    test("character selection start only", () => {
        const text = "Hello, World!";
        const result = TextArtifacts.view(text, { characterStart: 7 });
        expect(result).toBe("World!");
    });

    test("character selection end only", () => {
        const text = "Hello, World!";
        const result = TextArtifacts.view(text, { characterEnd: 5 });
        expect(result).toBe("Hello");
    });

    test("mutual exclusion line and character", () => {
        expect(() => TextArtifacts.view("hello", { lineStart: 1, characterStart: 0 })).toThrow(
            "Cannot use both line and character selection",
        );
    });

    test("no selection returns full", () => {
        const text = "Hello, World!";
        const result = TextArtifacts.view(text);
        expect(result).toBe(text);
    });

    test("character limit exceeded", () => {
        const text = "x".repeat(100);
        expect(() => TextArtifacts.view(text, { characterLimit: 50 })).toThrow("exceeds");
    });
});

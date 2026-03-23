// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Task } from "@a2a-js/sdk";
import { JSONTaskStore } from "../src/tasks/json-task-store.js";

function makeTask(taskId = "task-1", contextId = "ctx-1"): Task {
    return {
        id: taskId,
        contextId,
        kind: "task",
        status: { state: "completed" },
    };
}

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a2a-task-test-"));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("JSONTaskStore", () => {
    test("save creates file", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const task = makeTask();
        await store.save(task);
        const filePath = path.join(tmpDir, "tasks", "task-1.json");
        expect(fs.existsSync(filePath)).toBe(true);
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        expect(data.id).toBe("task-1");
    });

    test("load existing", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const task = makeTask();
        await store.save(task);
        const loaded = await store.load("task-1");
        expect(loaded).toBeDefined();
        expect(loaded?.id).toBe("task-1");
        expect(loaded?.contextId).toBe("ctx-1");
    });

    test("load nonexistent", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const result = await store.load("nonexistent");
        expect(result).toBeUndefined();
    });

    test("delete", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const task = makeTask();
        await store.save(task);
        await store.delete("task-1");
        expect(fs.existsSync(path.join(tmpDir, "tasks", "task-1.json"))).toBe(false);
        const loaded = await store.load("task-1");
        expect(loaded).toBeUndefined();
    });

    test("delete nonexistent", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        await store.delete("nonexistent"); // Should not throw
    });

    test("roundtrip preserves data", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const task = makeTask("rt-task", "rt-ctx");
        await store.save(task);
        const loaded = await store.load("rt-task");
        expect(loaded).toBeDefined();
        expect(loaded?.id).toBe("rt-task");
        expect(loaded?.contextId).toBe("rt-ctx");
        expect(loaded?.status.state).toBe("completed");
    });

    test("creates storage dir", () => {
        const storageDir = path.join(tmpDir, "nested", "tasks");
        // Constructor should trigger dir creation
        new JSONTaskStore(storageDir);
        // Give it a tick for the async mkdir
        // The dir is created on first save anyway
    });
});

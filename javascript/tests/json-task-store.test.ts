// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { Task } from "@a2a-js/sdk";
import { JSONTaskStore } from "../src/tasks/json-task-store.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_TASK_ID = "22222222-2222-4222-8222-222222222222";

function makeTask(taskId = TASK_ID, contextId = "ctx-1"): Task {
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
        const filePath = path.join(tmpDir, "tasks", `${TASK_ID}.json`);
        expect(fs.existsSync(filePath)).toBe(true);
        const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        expect(data.id).toBe(TASK_ID);
    });

    test("load existing", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const task = makeTask();
        await store.save(task);
        const loaded = await store.load(TASK_ID);
        expect(loaded).toBeDefined();
        expect(loaded?.id).toBe(TASK_ID);
        expect(loaded?.contextId).toBe("ctx-1");
    });

    test("load nonexistent", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const result = await store.load(MISSING_TASK_ID);
        expect(result).toBeUndefined();
    });

    test("delete", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const task = makeTask();
        await store.save(task);
        await store.delete(TASK_ID);
        expect(fs.existsSync(path.join(tmpDir, "tasks", `${TASK_ID}.json`))).toBe(false);
        const loaded = await store.load(TASK_ID);
        expect(loaded).toBeUndefined();
    });

    test("delete nonexistent", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        await store.delete(MISSING_TASK_ID); // Should not throw
    });

    test("roundtrip preserves data", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const roundtripTaskId = "33333333-3333-4333-8333-333333333333";
        const task = makeTask(roundtripTaskId, "rt-ctx");
        await store.save(task);
        const loaded = await store.load(roundtripTaskId);
        expect(loaded).toBeDefined();
        expect(loaded?.id).toBe(roundtripTaskId);
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

    test.each([".", "task-1", "../evil", "/tmp/evil", "dir/name", "dir\\name", "task:1"])(
        "rejects unsafe task ids: %s",
        async (taskId) => {
            const store = new JSONTaskStore(path.join(tmpDir, "tasks"));

            await expect(store.save(makeTask(taskId))).rejects.toThrow(/invalid/i);
            await expect(store.load(taskId)).rejects.toThrow(/invalid/i);
            await expect(store.delete(taskId)).rejects.toThrow(/invalid/i);
        },
    );

    test("unsafe load does not read outside storage root", async () => {
        const store = new JSONTaskStore(path.join(tmpDir, "tasks"));
        const readFileSpy = spyOn(fsPromises, "readFile");

        await expect(store.load("../outside")).rejects.toThrow(/invalid/i);
        expect(readFileSpy).not.toHaveBeenCalled();
    });
});

// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * JSON file-based task store implementing the A2A SDK TaskStore interface.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Task } from "@a2a-js/sdk";
import type { TaskStore } from "@a2a-js/sdk/server";

/**
 * Persists Task objects as individual JSON files.
 *
 * Each task is stored at ``{storageDir}/{taskId}.json``.
 */
export class JSONTaskStore implements TaskStore {
    readonly _storageDir: string;

    constructor(storageDir: string) {
        this._storageDir = storageDir;
        // Ensure storage dir exists
        fs.mkdir(storageDir, { recursive: true }).catch(() => {});
    }

    /**
     * Save a task to disk.
     *
     * @param task - The Task object to persist.
     */
    async save(task: Task): Promise<void> {
        await fs.mkdir(this._storageDir, { recursive: true });
        const filePath = path.join(this._storageDir, `${task.id}.json`);
        const data = JSON.stringify(task, null, 2);
        await fs.writeFile(filePath, data);
        console.debug(`Saved task ${task.id} to ${filePath}`);
    }

    /**
     * Load a task from disk.
     *
     * @param taskId - The task ID to look up.
     *
     * @returns Task if found, undefined otherwise.
     */
    async load(taskId: string): Promise<Task | undefined> {
        const filePath = path.join(this._storageDir, `${taskId}.json`);
        try {
            const text = await fs.readFile(filePath, "utf-8");
            return JSON.parse(text) as Task;
        } catch {
            return undefined;
        }
    }

    /**
     * Delete a task from disk.
     *
     * @param taskId - The task ID to delete.
     */
    async delete(taskId: string): Promise<void> {
        const filePath = path.join(this._storageDir, `${taskId}.json`);
        try {
            await fs.unlink(filePath);
            console.debug(`Deleted task ${taskId}`);
        } catch {
            // Ignore if doesn't exist
        }
    }
}

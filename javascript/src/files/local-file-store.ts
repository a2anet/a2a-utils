// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * LocalFileStore — filesystem-backed file storage.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Artifact, FileWithUri } from "@a2a-js/sdk";
import type { FileStore } from "./file-store.js";

/**
 * Store artifact files on the local filesystem.
 *
 * Files are saved to ``storageDir/taskId/artifactId/filename``.
 */
export class LocalFileStore implements FileStore {
    private readonly storageDir: string;

    constructor(storageDir: string) {
        this.storageDir = storageDir;
        // Ensure storage dir exists (sync in constructor, matching Python)
        fs.mkdir(storageDir, { recursive: true }).catch(() => {});
    }

    /**
     * Save file parts from an artifact to disk.
     *
     * Returns list of local file paths where files were saved.
     */
    async save(taskId: string, artifact: Artifact): Promise<string[]> {
        const savedPaths: string[] = [];
        const artifactDir = path.join(this.storageDir, taskId, artifact.artifactId);

        for (let i = 0; i < artifact.parts.length; i++) {
            const part = artifact.parts[i];
            if (part.kind !== "file") {
                continue;
            }

            const fileObj = part.file;
            let name = fileObj.name ? path.basename(fileObj.name) : `file_${i}`;
            name = name.replace(/\.\./g, "").replace(/^\.+/, "");
            if (!name) {
                name = `file_${i}`;
            }

            await fs.mkdir(artifactDir, { recursive: true });
            const filePath = path.join(artifactDir, name);

            // Path traversal check
            const resolvedPath = path.resolve(filePath);
            const resolvedDir = path.resolve(artifactDir);
            const relative = path.relative(resolvedDir, resolvedPath);
            if (relative.startsWith("..") || path.isAbsolute(relative)) {
                throw new Error(`Filename '${fileObj.name}' resolves outside storage directory`);
            }

            if ("bytes" in fileObj) {
                const data = Buffer.from(fileObj.bytes, "base64");
                await fs.writeFile(filePath, data);
            } else if ("uri" in fileObj) {
                const response = await fetch((fileObj as FileWithUri).uri);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const buffer = Buffer.from(await response.arrayBuffer());
                await fs.writeFile(filePath, buffer);
            }

            savedPaths.push(filePath);
        }

        return savedPaths;
    }

    /**
     * Get file paths for a saved artifact.
     *
     * Returns list of paths, or empty list if directory does not exist.
     */
    async get(taskId: string, artifactId: string): Promise<string[]> {
        const artifactDir = path.join(this.storageDir, taskId, artifactId);
        try {
            const entries = await fs.readdir(artifactDir);
            const files: string[] = [];
            for (const entry of entries.sort()) {
                const filePath = path.join(artifactDir, entry);
                const stat = await fs.stat(filePath);
                if (stat.isFile()) {
                    files.push(filePath);
                }
            }
            return files;
        } catch {
            return [];
        }
    }

    /** Delete saved files for an artifact. */
    async delete(taskId: string, artifactId: string): Promise<void> {
        const artifactDir = path.join(this.storageDir, taskId, artifactId);
        try {
            await fs.rm(artifactDir, { recursive: true, force: true });
        } catch {
            // Ignore if doesn't exist
        }
    }
}

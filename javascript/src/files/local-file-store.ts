// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * LocalFileStore — filesystem-backed file storage.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Artifact, FileWithUri, Message, Part } from "@a2a-js/sdk";
import type { FileStore } from "./file-store.js";

/**
 * Store files on the local filesystem.
 *
 * Artifacts are saved to ``storageDir/artifacts/taskId/artifactId/filename``.
 * Messages are saved to ``storageDir/messages/messageId/filename``.
 */
export class LocalFileStore implements FileStore {
    private readonly storageDir: string;

    constructor(storageDir: string) {
        this.storageDir = storageDir;
        // Ensure storage dir exists (async in constructor, matching Python)
        fs.mkdir(storageDir, { recursive: true }).catch(() => {});
    }

    /**
     * Save file parts from an artifact to disk.
     *
     * Returns list of local file paths where files were saved.
     */
    async saveArtifact(taskId: string, artifact: Artifact): Promise<string[]> {
        const dir = path.join(this.storageDir, "artifacts", taskId, artifact.artifactId);
        return this.saveFileParts(artifact.parts, dir);
    }

    /**
     * Get file paths for a saved artifact.
     *
     * Returns list of paths, or empty list if directory does not exist.
     */
    async getArtifact(taskId: string, artifactId: string): Promise<string[]> {
        const dir = path.join(this.storageDir, "artifacts", taskId, artifactId);
        return this.listFiles(dir);
    }

    /** Delete saved files for an artifact. */
    async deleteArtifact(taskId: string, artifactId: string): Promise<void> {
        const dir = path.join(this.storageDir, "artifacts", taskId, artifactId);
        await this.removeDir(dir);
    }

    /**
     * Save file parts from a message to disk.
     *
     * Returns list of local file paths where files were saved.
     */
    async saveMessage(message: Message): Promise<string[]> {
        const dir = path.join(this.storageDir, "messages", message.messageId);
        return this.saveFileParts(message.parts, dir);
    }

    /**
     * Get file paths for a saved message.
     *
     * Returns list of paths, or empty list if directory does not exist.
     */
    async getMessage(messageId: string): Promise<string[]> {
        const dir = path.join(this.storageDir, "messages", messageId);
        return this.listFiles(dir);
    }

    /** Delete saved files for a message. */
    async deleteMessage(messageId: string): Promise<void> {
        const dir = path.join(this.storageDir, "messages", messageId);
        await this.removeDir(dir);
    }

    // -- Private helpers --

    /**
     * Save file parts from a list of parts to a target directory.
     *
     * Handles both FileWithBytes (base64 decode) and FileWithUri (HTTP download).
     * Returns list of local file paths where files were saved.
     */
    private async saveFileParts(parts: Part[], targetDir: string): Promise<string[]> {
        const savedPaths: string[] = [];

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.kind !== "file") {
                continue;
            }

            const fileObj = part.file;
            let name = fileObj.name ? path.basename(fileObj.name) : `file_${i}`;
            name = name.replace(/\.\./g, "").replace(/^\.+/, "");
            if (!name) {
                name = `file_${i}`;
            }

            await fs.mkdir(targetDir, { recursive: true });
            const filePath = path.join(targetDir, name);

            // Path traversal check
            const resolvedPath = path.resolve(filePath);
            const resolvedDir = path.resolve(targetDir);
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

    /** List all files in a directory, returning sorted paths. */
    private async listFiles(dir: string): Promise<string[]> {
        try {
            const entries = await fs.readdir(dir);
            const files: string[] = [];
            for (const entry of entries.sort()) {
                const filePath = path.join(dir, entry);
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

    /** Remove a directory recursively. */
    private async removeDir(dir: string): Promise<void> {
        try {
            await fs.rm(dir, { recursive: true, force: true });
        } catch {
            // Ignore if doesn't exist
        }
    }
}

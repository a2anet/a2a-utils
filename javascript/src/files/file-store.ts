// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * FileStore abstract interface.
 */

import type { Artifact, Message } from "@a2a-js/sdk";

/** Abstract interface for file storage. */
export interface FileStore {
    /**
     * Save file parts from an artifact.
     *
     * Returns list of storage locations where files were saved
     * (e.g. local paths, cloud URIs, etc.).
     */
    saveArtifact(taskId: string, artifact: Artifact): Promise<string[]>;

    /**
     * Get storage locations for a saved artifact's files.
     * Returns empty list if not found.
     */
    getArtifact(taskId: string, artifactId: string): Promise<string[]>;

    /**
     * Delete saved files for an artifact.
     */
    deleteArtifact(taskId: string, artifactId: string): Promise<void>;

    /**
     * Save file parts from a message.
     *
     * Returns list of storage locations where files were saved.
     */
    saveMessage(message: Message): Promise<string[]>;

    /**
     * Get storage locations for a saved message's files.
     * Returns empty list if not found.
     */
    getMessage(messageId: string): Promise<string[]>;

    /**
     * Delete saved files for a message.
     */
    deleteMessage(messageId: string): Promise<void>;
}

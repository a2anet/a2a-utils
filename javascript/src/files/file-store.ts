// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * FileStore abstract interface.
 */

import type { Artifact } from "@a2a-js/sdk";

/** Abstract interface for file storage. */
export interface FileStore {
    /**
     * Save file parts from an artifact.
     *
     * Returns list of storage locations where files were saved
     * (e.g. local paths, cloud URIs, etc.).
     */
    save(taskId: string, artifact: Artifact): Promise<string[]>;

    /**
     * Get storage locations for a saved artifact's files.
     * Returns empty list if not found.
     */
    get(taskId: string, artifactId: string): Promise<string[]>;

    /**
     * Delete saved files for an artifact.
     */
    delete(taskId: string, artifactId: string): Promise<void>;
}

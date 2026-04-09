// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import * as path from "node:path";
import { UUID_RE, assertUuid } from "./identifiers.js";

export const SAFE_STORAGE_ID_RE = UUID_RE;

export function assertSafeStorageId(name: string, value: string): void {
    assertUuid(name, value);
}

export function assertWithinRoot(root: string, target: string): void {
    const resolvedRoot = path.resolve(root);
    const resolvedTarget = path.resolve(target);
    const relative = path.relative(resolvedRoot, resolvedTarget);

    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Path escapes storage root: '${target}'`);
    }
}

export function safeJoin(root: string, ...segments: string[]): string {
    const target = path.join(root, ...segments);
    assertWithinRoot(root, target);
    return target;
}

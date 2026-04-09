// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { Message, Task } from "@a2a-js/sdk";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DEFAULT_REMOTE_FILE_URI_SCHEMES = ["https:"];

type ParseRemoteFileUriOptions = {
    allowedSchemes?: Iterable<string>;
    base?: URL;
};

export function assertUuid(name: string, value: string): void {
    if (!UUID_RE.test(value)) {
        throw new Error(`Invalid ${name}: '${value}'. Expected UUID.`);
    }
}

export function assertMessageIdentifiers(message: Message): void {
    assertUuid("message id", message.messageId);
    if (message.taskId != null) {
        assertUuid("task id", message.taskId);
    }
}

export function assertTaskIdentifiers(task: Task): void {
    assertUuid("task id", task.id);
    for (const artifact of task.artifacts ?? []) {
        assertUuid("artifact id", artifact.artifactId);
    }
    if (task.status.message != null) {
        assertMessageIdentifiers(task.status.message as Message);
    }
    for (const message of task.history ?? []) {
        assertMessageIdentifiers(message as Message);
    }
}

export function normalizeAllowedUriSchemes(schemes?: Iterable<string>): string[] {
    const values = schemes ? Array.from(schemes) : DEFAULT_REMOTE_FILE_URI_SCHEMES;
    if (values.length === 0) {
        throw new Error("allowedUriSchemes must not be empty");
    }

    return Array.from(
        new Set(
            values.map((scheme) => {
                const normalized = scheme.trim().toLowerCase();
                if (!/^[a-z][a-z0-9+.-]*:$/.test(normalized)) {
                    throw new Error(`Invalid URI scheme: '${scheme}'`);
                }
                return normalized;
            }),
        ),
    );
}

export function parseRemoteFileUri(uri: string, options: ParseRemoteFileUriOptions = {}): URL {
    let url: URL;
    try {
        url = options.base ? new URL(uri, options.base) : new URL(uri);
    } catch {
        throw new Error(`Invalid remote file URI: '${uri}'`);
    }

    const allowedSchemes = new Set(normalizeAllowedUriSchemes(options.allowedSchemes));
    if (!allowedSchemes.has(url.protocol.toLowerCase())) {
        throw new Error(`Disallowed remote file URI scheme: '${url.protocol}'`);
    }
    if (url.username || url.password) {
        throw new Error("Remote file URIs must not include credentials");
    }
    return url;
}

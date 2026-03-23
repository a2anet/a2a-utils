// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Typed interfaces for LLM-facing A2A responses.
 */

import type { AgentCard, TaskState } from "@a2a-js/sdk";

export interface AgentURLAndCustomHeaders {
    readonly agentCard: AgentCard;
    readonly customHeaders: Record<string, string>;
}

export const TERMINAL_OR_ACTIONABLE_STATES: ReadonlySet<string> = new Set<string>([
    "completed",
    "canceled",
    "failed",
    "rejected",
    "input-required",
    "auth-required",
]);

/** Configuration for artifact minimization and viewing. */
export class ArtifactSettings {
    readonly sendMessageCharacterLimit: number;
    readonly minimizedObjectStringLength: number;
    readonly viewArtifactCharacterLimit: number;

    constructor(opts?: {
        sendMessageCharacterLimit?: number;
        minimizedObjectStringLength?: number;
        viewArtifactCharacterLimit?: number;
    }) {
        this.sendMessageCharacterLimit = opts?.sendMessageCharacterLimit ?? 50_000;
        this.minimizedObjectStringLength = opts?.minimizedObjectStringLength ?? 5_000;
        this.viewArtifactCharacterLimit = opts?.viewArtifactCharacterLimit ?? 50_000;
    }
}

// -- LLM-facing part types (simple, no SDK wrapper overhead) --

export interface TextPartForLLM {
    readonly kind: "text";
    readonly text: string;
    readonly _total_lines?: number;
    readonly _total_characters?: number;
    readonly _start_line_range?: string;
    readonly _end_line_range?: string;
    readonly _start_character_range?: string;
    readonly _end_character_range?: string;
    readonly _tip?: string;
}

export interface DataPartForLLM {
    readonly kind: "data";
    readonly data: unknown;
}

export interface FilePartForLLM {
    readonly kind: "file";
    readonly name: string | null;
    readonly mimeType: string | null;
    readonly uri: string | Record<string, unknown> | null;
    readonly bytes: Record<string, unknown> | null;
}

export interface ArtifactForLLM {
    readonly artifactId: string;
    readonly description: string | null;
    readonly name: string | null;
    readonly parts: ReadonlyArray<TextPartForLLM | DataPartForLLM | FilePartForLLM>;
}

export interface MessageForLLM {
    readonly contextId: string | null;
    readonly kind: "message";
    readonly parts: ReadonlyArray<TextPartForLLM | DataPartForLLM | FilePartForLLM>;
}

export interface TaskStatusForLLM {
    readonly state: TaskState;
    readonly message: MessageForLLM | null;
}

export interface TaskForLLM {
    readonly id: string;
    readonly contextId: string;
    readonly kind: "task";
    readonly status: TaskStatusForLLM;
    readonly artifacts: ReadonlyArray<ArtifactForLLM>;
}

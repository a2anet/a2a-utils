// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import type { Artifact } from "@a2a-js/sdk";
import type { A2AAgents } from "../src/client/a2a-agents.js";
import type { A2ASession } from "../src/client/a2a-session.js";
import type { A2ATools } from "../src/client/a2a-tools.js";
import type { AgentURLAndCustomHeaders, ArtifactSettings } from "../src/types.js";

export type A2AAgentsInternals = A2AAgents & {
    config: Record<string, Record<string, unknown>>;
    agents: Record<string, AgentURLAndCustomHeaders>;
    initErrors: Record<string, string>;
    initialized: boolean;
    timeout: number;
    ensureInitialized(): Promise<void>;
    fetchAgent(agentId: string, config: Record<string, unknown>): Promise<void>;
    createFetchImpl(customHeaders: Record<string, string>): typeof fetch;
};

export type A2ASessionInternals = A2ASession & {
    sendMessageTimeout: number;
    getTaskTimeout: number;
    getTaskPollInterval: number;
};

export type A2AToolsInternals = A2ATools & {
    session: A2ASession;
    artifactSettings: ArtifactSettings;
    getArtifact(agentId: string, taskId: string, artifactId: string): Promise<Artifact>;
};

export type A2AToolsStatics = typeof import("../src/client/a2a-tools.js").A2ATools;

export type DataArtifactsStatics = {
    evaluateJsonPath(data: unknown, path: string): unknown;
    parseRowSelection(rows: number | number[] | string, totalRows: number): number[];
    parseColumnSelection(columns: string | string[], availableColumns: string[]): string[];
    filterDataByRowsAndColumns(
        data: Record<string, unknown>[],
        rowIndices: number[],
        columnNames: string[],
    ): Record<string, unknown>[];
    minimizeObject(
        obj: Record<string, unknown>,
        opts?: {
            characterLimit?: number;
            minimizedObjectStringLength?: number;
            tip?: string | null;
        },
    ): Record<string, unknown>;
};

export type TextArtifactsStatics = {
    parseLineRange(
        lineStart: number | null,
        lineEnd: number | null,
        totalLines: number,
    ): [number, number];
};

export function getA2AAgentsInternals(manager: A2AAgents): A2AAgentsInternals {
    return manager as unknown as A2AAgentsInternals;
}

export function getSessionInternals(session: A2ASession): A2ASessionInternals {
    return session as unknown as A2ASessionInternals;
}

export function getToolsInternals(tools: A2ATools): A2AToolsInternals {
    return tools as unknown as A2AToolsInternals;
}

export function getToolsStatics<T>(toolsClass: T): T & A2AToolsStatics {
    return toolsClass as T & A2AToolsStatics;
}

export function getDataArtifactsStatics<T>(dataArtifactsClass: T): T & DataArtifactsStatics {
    return dataArtifactsClass as T & DataArtifactsStatics;
}

export function getTextArtifactsStatics<T>(textArtifactsClass: T): T & TextArtifactsStatics {
    return textArtifactsClass as T & TextArtifactsStatics;
}

// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Artifact viewing and minimization utilities.
 */

import type { Artifact, FileWithBytes, FileWithUri } from "@a2a-js/sdk";
import type { ArtifactForLLM, DataPartForLLM, FilePartForLLM, TextPartForLLM } from "../types.js";
import { DataArtifacts } from "./data.js";
import { TextArtifacts } from "./text.js";

/**
 * Minimize artifact list for LLM display.
 *
 * Combines all TextParts within each artifact into a single TextPartForLLM.
 * Handles FileParts by including file metadata and saved paths.
 *
 * @param artifacts - List of artifacts to minimize.
 * @param opts.characterLimit - Character limit above which to minimize.
 * @param opts.minimizedObjectStringLength - Max length for string values in objects.
 * @param opts.savedFilePaths - Mapping of artifactId to saved file paths.
 *     When provided, file parts show saved locations.
 *     When null, FileWithBytes parts show an error and FileWithUri parts
 *     show the raw URI.
 * @param opts.textTip - Tip string for minimized text artifacts. null = no tip.
 * @param opts.dataTip - Tip string for minimized data artifacts. null = no tip.
 *
 * @returns List of ArtifactForLLM objects.
 */
export function minimizeArtifacts(
    artifacts: Artifact[],
    opts?: {
        characterLimit?: number;
        minimizedObjectStringLength?: number;
        savedFilePaths?: Record<string, string[]> | null;
        textTip?: string | null;
        dataTip?: string | null;
    },
): ArtifactForLLM[] {
    const characterLimit = opts?.characterLimit ?? 50_000;
    const minimizedObjectStringLength = opts?.minimizedObjectStringLength ?? 5_000;
    const savedFilePaths = opts?.savedFilePaths ?? null;
    const textTip = opts?.textTip ?? null;
    const dataTip = opts?.dataTip ?? null;

    const result: ArtifactForLLM[] = [];

    for (const artifact of artifacts) {
        const parts: (TextPartForLLM | DataPartForLLM | FilePartForLLM)[] = [];

        // Combine all text parts into one
        const textSegments: string[] = [];
        for (const part of artifact.parts) {
            if (part.kind === "text") {
                textSegments.push(part.text);
            }
        }

        if (textSegments.length > 0) {
            const combinedText = textSegments.join("");
            const textMinimized = TextArtifacts.minimize(combinedText, {
                characterLimit,
                tip: textTip,
            });
            parts.push({
                kind: "text",
                ...(textMinimized as Omit<TextPartForLLM, "kind">),
            });
        }

        // Each data part stays separate
        for (const part of artifact.parts) {
            if (part.kind === "data") {
                const dataMinimized = DataArtifacts.minimize(part.data, {
                    characterLimit,
                    minimizedObjectStringLength,
                    tip: dataTip,
                });
                parts.push({ kind: "data", data: dataMinimized });
            }
        }

        // Handle file parts
        const artifactSaved =
            savedFilePaths !== null ? (savedFilePaths[artifact.artifactId] ?? null) : null;

        for (const part of artifact.parts) {
            if (part.kind === "file") {
                const fileObj = part.file;
                const name = fileObj.name ?? null;
                const mimeType = fileObj.mimeType ?? null;

                let filePart: FilePartForLLM;

                if ("bytes" in fileObj) {
                    // FileWithBytes
                    if (artifactSaved !== null) {
                        filePart = {
                            kind: "file",
                            name,
                            mimeType,
                            uri: null,
                            bytes: { _saved_to: artifactSaved },
                        };
                    } else {
                        filePart = {
                            kind: "file",
                            name,
                            mimeType,
                            uri: null,
                            bytes: {
                                _error: "No FileStore configured. Cannot access file bytes.",
                            },
                        };
                    }
                } else if ("uri" in fileObj) {
                    // FileWithUri
                    if (artifactSaved !== null) {
                        filePart = {
                            kind: "file",
                            name,
                            mimeType,
                            uri: { _saved_to: artifactSaved },
                            bytes: null,
                        };
                    } else {
                        filePart = {
                            kind: "file",
                            name,
                            mimeType,
                            uri: (fileObj as FileWithUri).uri,
                            bytes: null,
                        };
                    }
                } else {
                    continue;
                }

                parts.push(filePart);
            }
        }

        result.push({
            artifactId: artifact.artifactId,
            description: artifact.description ?? null,
            name: artifact.name ?? null,
            parts,
        });
    }

    return result;
}

export { DataArtifacts } from "./data.js";
export { TextArtifacts } from "./text.js";

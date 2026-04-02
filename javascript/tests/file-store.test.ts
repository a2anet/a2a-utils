// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Artifact } from "@a2a-js/sdk";
import { minimizeArtifacts } from "../src/artifacts/index.js";
import { LocalFileStore } from "../src/files/local-file-store.js";
import type { FilePartForLLM } from "../src/types.js";

function makeBytesArtifact(opts?: {
    artifactId?: string;
    name?: string;
    mimeType?: string;
    content?: Uint8Array;
}): Artifact {
    const content = opts?.content ?? new TextEncoder().encode("hello world");
    const encoded = Buffer.from(content).toString("base64");
    return {
        artifactId: opts?.artifactId ?? "art-1",
        parts: [
            {
                kind: "file",
                file: {
                    bytes: encoded,
                    name: opts?.name ?? "report.pdf",
                    mimeType: opts?.mimeType ?? "application/pdf",
                },
            },
        ],
    };
}

function makeUriArtifact(opts?: {
    artifactId?: string;
    name?: string;
    mimeType?: string;
    uri?: string;
}): Artifact {
    return {
        artifactId: opts?.artifactId ?? "art-2",
        parts: [
            {
                kind: "file",
                file: {
                    uri: opts?.uri ?? "https://example.com/image.png",
                    name: opts?.name ?? "image.png",
                    mimeType: opts?.mimeType ?? "image/png",
                },
            },
        ],
    };
}

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "a2a-file-test-"));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("LocalFileStore", () => {
    test("save bytes artifact", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const content = new TextEncoder().encode("PDF content here");
        const artifact = makeBytesArtifact({ content });

        const paths = await store.saveArtifact("task-1", artifact);

        expect(paths.length).toBe(1);
        expect(fs.existsSync(paths[0])).toBe(true);
        expect(fs.readFileSync(paths[0]).toString()).toBe("PDF content here");
        expect(path.basename(paths[0])).toBe("report.pdf");
    });

    test("get paths", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const artifact = makeBytesArtifact();

        await store.saveArtifact("task-1", artifact);
        const paths = await store.getArtifact("task-1", "art-1");

        expect(paths.length).toBe(1);
        expect(paths[0]).toContain("report.pdf");
    });

    test("get nonexistent", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const paths = await store.getArtifact("task-1", "nonexistent");
        expect(paths).toEqual([]);
    });

    test("delete", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const artifact = makeBytesArtifact();

        await store.saveArtifact("task-1", artifact);
        const artifactDir = path.join(tmpDir, "files", "artifacts", "task-1", "art-1");
        expect(fs.existsSync(artifactDir)).toBe(true);

        await store.deleteArtifact("task-1", "art-1");
        expect(fs.existsSync(artifactDir)).toBe(false);
    });

    test("delete nonexistent", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        // Should not throw
        await store.deleteArtifact("task-1", "nonexistent");
    });

    test("storage dir structure", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const artifact = makeBytesArtifact({ artifactId: "art-abc" });
        await store.saveArtifact("task-xyz", artifact);

        const expectedDir = path.join(tmpDir, "files", "artifacts", "task-xyz", "art-abc");
        expect(fs.statSync(expectedDir).isDirectory()).toBe(true);
        expect(fs.existsSync(path.join(expectedDir, "report.pdf"))).toBe(true);
    });

    test("no file parts returns empty", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const artifact: Artifact = {
            artifactId: "art-text",
            parts: [{ kind: "text", text: "hello" }],
        };
        const paths = await store.saveArtifact("task-1", artifact);
        expect(paths).toEqual([]);
    });
});

describe("file part handling", () => {
    test("minimize with saved file paths", () => {
        const artifact = makeBytesArtifact();
        const result = minimizeArtifacts([artifact], {
            savedFilePaths: { "art-1": ["/storage/task-1/art-1/report.pdf"] },
        });

        expect(result.length).toBe(1);
        const fileParts = result[0].parts.filter((p) => p.kind === "file") as FilePartForLLM[];
        expect(fileParts.length).toBe(1);
        const fp = fileParts[0];
        expect(fp.kind).toBe("file");
        expect(fp.name).toBe("report.pdf");
        expect(fp.mimeType).toBe("application/pdf");
        expect(fp.bytes).toEqual({
            _saved_to: ["/storage/task-1/art-1/report.pdf"],
        });
        expect(fp.uri).toBeNull();
    });

    test("minimize bytes without file store", () => {
        const artifact = makeBytesArtifact();
        const result = minimizeArtifacts([artifact]);

        const fileParts = result[0].parts.filter((p) => p.kind === "file") as FilePartForLLM[];
        expect(fileParts.length).toBe(1);
        const fp = fileParts[0];
        expect(fp.bytes).not.toBeNull();
        expect(fp.bytes?._error).toBeDefined();
        expect(fp.uri).toBeNull();
    });

    test("minimize uri without file store", () => {
        const artifact = makeUriArtifact({ uri: "https://example.com/doc.pdf" });
        const result = minimizeArtifacts([artifact]);

        const fileParts = result[0].parts.filter((p) => p.kind === "file") as FilePartForLLM[];
        expect(fileParts.length).toBe(1);
        const fp = fileParts[0];
        expect(fp.uri).toBe("https://example.com/doc.pdf");
        expect(fp.bytes).toBeNull();
    });

    test("minimize uri with saved file paths", () => {
        const artifact = makeUriArtifact();
        const result = minimizeArtifacts([artifact], {
            savedFilePaths: { "art-2": ["/storage/task-1/art-2/image.png"] },
        });

        const fileParts = result[0].parts.filter((p) => p.kind === "file") as FilePartForLLM[];
        expect(fileParts.length).toBe(1);
        const fp = fileParts[0];
        expect(fp.uri).toEqual({
            _saved_to: ["/storage/task-1/art-2/image.png"],
        });
        expect(fp.bytes).toBeNull();
    });

    test("mixed parts artifact", () => {
        const content = Buffer.from("content").toString("base64");
        const artifact: Artifact = {
            artifactId: "art-mix",
            parts: [
                { kind: "text", text: "Summary" },
                { kind: "data", data: { key: "value" } },
                {
                    kind: "file",
                    file: {
                        bytes: content,
                        name: "file.bin",
                        mimeType: "application/octet-stream",
                    },
                },
            ],
        };

        const result = minimizeArtifacts([artifact]);
        expect(result.length).toBe(1);
        const parts = result[0].parts;
        // Text part, data part, file part
        expect(parts.length).toBe(3);
        expect(parts[0].kind).toBe("text");
        expect(parts[1].kind).toBe("data");
        expect(parts[2].kind).toBe("file");
    });

    test("minimize preserves text metadata", () => {
        const artifact: Artifact = {
            artifactId: "art-text",
            parts: [{ kind: "text", text: `first\n${"x".repeat(60_000)}\nlast` }],
        };

        const result = minimizeArtifacts([artifact], {
            characterLimit: 50_000,
            textTip: "use view_text_artifact",
        });

        const textPart = result[0].parts[0] as {
            kind: string;
            text: string;
            _total_characters?: number;
            _total_lines?: number;
            _tip?: string;
            _start_line_range?: string;
            _end_line_range?: string;
        };
        expect(textPart.kind).toBe("text");
        expect(textPart._total_characters).toBeGreaterThan(50_000);
        expect(textPart._total_lines).toBe(3);
        expect(textPart._tip).toBe("use view_text_artifact");
        expect(textPart._start_line_range).toBeDefined();
        expect(textPart._end_line_range).toBeDefined();
    });
});

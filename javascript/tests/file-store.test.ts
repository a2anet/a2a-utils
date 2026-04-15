// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as dns from "node:dns/promises";
import * as fs from "node:fs";
import type * as http from "node:http";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";
import { PassThrough } from "node:stream";
import { gzipSync } from "node:zlib";
import type { Artifact, Message } from "@a2a-js/sdk";
import { minimizeArtifacts } from "../src/artifacts/index.js";
import { LocalFileStore } from "../src/files/local-file-store.js";
import type { FilePartForLLM } from "../src/types.js";

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const MISSING_TASK_ID = "22222222-2222-4222-8222-222222222222";
const ARTIFACT_ID = "33333333-3333-4333-8333-333333333333";
const URI_ARTIFACT_ID = "44444444-4444-4444-8444-444444444444";
const MISSING_ARTIFACT_ID = "55555555-5555-4555-8555-555555555555";
const MESSAGE_ID = "66666666-6666-4666-8666-666666666666";
const MISSING_MESSAGE_ID = "77777777-7777-4777-8777-777777777777";

function makeBytesArtifact(opts?: {
    artifactId?: string;
    name?: string;
    mimeType?: string;
    content?: Uint8Array;
}): Artifact {
    const content = opts?.content ?? new TextEncoder().encode("hello world");
    const encoded = Buffer.from(content).toString("base64");
    return {
        artifactId: opts?.artifactId ?? ARTIFACT_ID,
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
        artifactId: opts?.artifactId ?? URI_ARTIFACT_ID,
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

function makeMessage(messageId = MESSAGE_ID, uri?: string): Message {
    return {
        role: "user",
        messageId,
        kind: "message",
        parts: [
            {
                kind: "file",
                file: uri
                    ? {
                          uri,
                          name: "message.txt",
                          mimeType: "text/plain",
                      }
                    : {
                          bytes: Buffer.from("message-body").toString("base64"),
                          name: "message.txt",
                          mimeType: "text/plain",
                      },
            },
        ],
    };
}

function makeMockResponse(
    statusCode: number,
    headers: http.IncomingHttpHeaders = {},
    body: Buffer | string = "",
): http.IncomingMessage {
    const response = new PassThrough() as PassThrough & http.IncomingMessage;
    response.statusCode = statusCode;
    response.statusMessage = statusCode === 302 ? "Found" : "OK";
    response.headers = headers;

    queueMicrotask(() => {
        if (body) {
            response.write(body);
        }
        response.end();
    });

    return response;
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

        const paths = await store.saveArtifact(TASK_ID, artifact);

        expect(paths.length).toBe(1);
        expect(fs.existsSync(paths[0])).toBe(true);
        expect(fs.readFileSync(paths[0]).toString()).toBe("PDF content here");
        expect(path.basename(paths[0])).toBe("report.pdf");
    });

    test("get paths", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const artifact = makeBytesArtifact();

        await store.saveArtifact(TASK_ID, artifact);
        const paths = await store.getArtifact(TASK_ID, ARTIFACT_ID);

        expect(paths.length).toBe(1);
        expect(paths[0]).toContain("report.pdf");
    });

    test("get nonexistent", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const paths = await store.getArtifact(MISSING_TASK_ID, MISSING_ARTIFACT_ID);
        expect(paths).toEqual([]);
    });

    test("delete", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const artifact = makeBytesArtifact();

        await store.saveArtifact(TASK_ID, artifact);
        const artifactDir = path.join(tmpDir, "files", "artifacts", TASK_ID, ARTIFACT_ID);
        expect(fs.existsSync(artifactDir)).toBe(true);

        await store.deleteArtifact(TASK_ID, ARTIFACT_ID);
        expect(fs.existsSync(artifactDir)).toBe(false);
    });

    test("delete nonexistent", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        // Should not throw
        await store.deleteArtifact(MISSING_TASK_ID, MISSING_ARTIFACT_ID);
    });

    test("storage dir structure", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const taskId = "88888888-8888-4888-8888-888888888888";
        const artifactId = "99999999-9999-4999-8999-999999999999";
        const artifact = makeBytesArtifact({ artifactId });
        await store.saveArtifact(taskId, artifact);

        const expectedDir = path.join(tmpDir, "files", "artifacts", taskId, artifactId);
        expect(fs.statSync(expectedDir).isDirectory()).toBe(true);
        expect(fs.existsSync(path.join(expectedDir, "report.pdf"))).toBe(true);
    });

    test("no file parts returns empty", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const artifact: Artifact = {
            artifactId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            parts: [{ kind: "text", text: "hello" }],
        };
        const paths = await store.saveArtifact(TASK_ID, artifact);
        expect(paths).toEqual([]);
    });

    test("save https uri artifact with injected downloader", async () => {
        const fetchFileUriCalls: string[] = [];
        const store = new LocalFileStore(path.join(tmpDir, "files"), {
            fetchFileUri: async (uri) => {
                fetchFileUriCalls.push(uri);
                return new TextEncoder().encode("downloaded over https");
            },
        });

        const paths = await store.saveArtifact(
            TASK_ID,
            makeUriArtifact({ uri: "https://example.com/file.txt", name: "file.txt" }),
        );

        expect(fetchFileUriCalls).toEqual(["https://example.com/file.txt"]);
        expect(fs.readFileSync(paths[0], "utf-8")).toBe("downloaded over https");
    });

    test.each([
        "http://127.0.0.1/secret",
        "http://169.254.169.254/latest/meta-data",
        "https://[::1]/secret",
        "https://[::ffff:7f00:1]/secret",
        "file:///etc/passwd",
        "not a url",
    ])("rejects unsafe remote uri %s", async (uri) => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        await expect(
            store.saveArtifact(TASK_ID, makeUriArtifact({ uri, name: "bad.txt" })),
        ).rejects.toThrow();
    });

    test("default downloader rejects redirects to private targets", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const lookupSpy = spyOn(dns, "lookup").mockResolvedValue([
            { address: "93.184.216.34", family: 4 },
        ]);
        const requestSpy = spyOn(https, "request").mockImplementation(((options, callback) => {
            queueMicrotask(() => {
                callback?.(
                    makeMockResponse(302, {
                        location: "https://169.254.169.254/latest/meta-data",
                    }),
                );
            });
            return new PassThrough() as unknown as http.ClientRequest;
        }) as typeof https.request);

        try {
            await expect(
                store.saveArtifact(
                    TASK_ID,
                    makeUriArtifact({
                        uri: "https://example.com/start",
                        name: "redirect.txt",
                    }),
                ),
            ).rejects.toThrow(/blocked remote file host/i);
            expect(lookupSpy).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
            expect(requestSpy).toHaveBeenCalledTimes(1);
        } finally {
            lookupSpy.mockRestore();
            requestSpy.mockRestore();
        }
    });

    test("default downloader pins the resolved address on the request", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const lookupSpy = spyOn(dns, "lookup").mockResolvedValue([
            { address: "93.184.216.34", family: 4 },
        ]);
        const requestOptions: https.RequestOptions[] = [];
        const requestSpy = spyOn(https, "request").mockImplementation(((options, callback) => {
            requestOptions.push(options as https.RequestOptions);
            queueMicrotask(() => {
                callback?.(makeMockResponse(200, { "content-length": "18" }, "resolved download"));
            });
            return new PassThrough() as unknown as http.ClientRequest;
        }) as typeof https.request);

        try {
            const paths = await store.saveArtifact(
                TASK_ID,
                makeUriArtifact({ uri: "https://example.com/file.txt", name: "file.txt" }),
            );

            expect(lookupSpy).toHaveBeenCalledWith("example.com", { all: true, verbatim: true });
            expect(requestOptions).toHaveLength(1);
            expect(requestOptions[0].hostname).toBe("93.184.216.34");
            expect(requestOptions[0].headers).toMatchObject({
                "Accept-Encoding": "identity",
                Host: "example.com",
            });
            expect(requestOptions[0].servername).toBe("example.com");
            expect(fs.readFileSync(paths[0], "utf-8")).toBe("resolved download");
        } finally {
            lookupSpy.mockRestore();
            requestSpy.mockRestore();
        }
    });

    test("default downloader decodes gzip responses before saving", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const lookupSpy = spyOn(dns, "lookup").mockResolvedValue([
            { address: "93.184.216.34", family: 4 },
        ]);
        const compressed = gzipSync("decoded download");
        const requestSpy = spyOn(https, "request").mockImplementation(((options, callback) => {
            queueMicrotask(() => {
                callback?.(
                    makeMockResponse(
                        200,
                        {
                            "content-encoding": "gzip",
                            "content-length": String(compressed.length),
                        },
                        compressed,
                    ),
                );
            });
            return new PassThrough() as unknown as http.ClientRequest;
        }) as typeof https.request);

        try {
            const paths = await store.saveArtifact(
                TASK_ID,
                makeUriArtifact({ uri: "https://example.com/file.txt", name: "file.txt" }),
            );

            expect(fs.readFileSync(paths[0], "utf-8")).toBe("decoded download");
        } finally {
            lookupSpy.mockRestore();
            requestSpy.mockRestore();
        }
    });

    test.each([
        { taskId: "../escape", artifactId: ARTIFACT_ID, messageId: MESSAGE_ID },
        { taskId: TASK_ID, artifactId: "../escape", messageId: MESSAGE_ID },
        { taskId: TASK_ID, artifactId: ARTIFACT_ID, messageId: "../escape" },
        { taskId: "task/escape", artifactId: ARTIFACT_ID, messageId: MESSAGE_ID },
        { taskId: TASK_ID, artifactId: "artifact/escape", messageId: MESSAGE_ID },
        { taskId: TASK_ID, artifactId: ARTIFACT_ID, messageId: "message/escape" },
    ])("rejects traversal ids %#", async ({ taskId, artifactId, messageId }) => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));

        if (taskId !== TASK_ID || artifactId !== ARTIFACT_ID) {
            await expect(
                store.saveArtifact(taskId, makeBytesArtifact({ artifactId })),
            ).rejects.toThrow(/invalid/i);
        }

        if (messageId !== MESSAGE_ID) {
            await expect(store.saveMessage(makeMessage(messageId))).rejects.toThrow(/invalid/i);
        }
    });

    test("accepts opaque response-style ids", async () => {
        const store = new LocalFileStore(path.join(tmpDir, "files"));
        const taskId = "task-1";
        const artifactId = "artifact-1";
        const messageId = "resp_04d5f520890c81ff0069deeb2650e08196b2fa18cc08f9f3d9_1";

        const artifactPaths = await store.saveArtifact(
            taskId,
            makeBytesArtifact({ artifactId, content: new TextEncoder().encode("artifact") }),
        );
        const messagePaths = await store.saveMessage(makeMessage(messageId));

        expect(artifactPaths).toHaveLength(1);
        expect(messagePaths).toHaveLength(1);
        expect(fs.readFileSync(artifactPaths[0], "utf-8")).toBe("artifact");
        expect(fs.readFileSync(messagePaths[0], "utf-8")).toBe("message-body");
    });
});

describe("file part handling", () => {
    test("minimize with saved file paths", () => {
        const artifact = makeBytesArtifact();
        const result = minimizeArtifacts([artifact], {
            savedFilePaths: { [ARTIFACT_ID]: ["/storage/task-1/art-1/report.pdf"] },
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
            savedFilePaths: { [URI_ARTIFACT_ID]: ["/storage/task-1/art-2/image.png"] },
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

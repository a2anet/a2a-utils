// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * LocalFileStore — filesystem-backed file storage.
 */

import * as dns from "node:dns/promises";
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as https from "node:https";
import { BlockList, isIP } from "node:net";
import * as path from "node:path";
import { Readable } from "node:stream";
import { createBrotliDecompress, createUnzip } from "node:zlib";
import type { Artifact, FileWithUri, Message, Part } from "@a2a-js/sdk";
import { normalizeAllowedUriSchemes, parseRemoteFileUri } from "../storage/identifiers.js";
import { assertSafeStorageId, safeJoin } from "../storage/path-safety.js";
import type { FileStore } from "./file-store.js";

export type LocalFileStoreFetchResult = ArrayBuffer | Uint8Array;

export type LocalFileStoreFetchFileUri = (uri: string) => Promise<LocalFileStoreFetchResult>;

export type LocalFileStoreOptions = {
    fetchFileUri?: LocalFileStoreFetchFileUri;
    allowedUriSchemes?: string[];
    maxRemoteBytes?: number;
};

type ResolvedRemoteAddress = {
    address: string;
    family: 4 | 6;
};

/**
 * Store files on the local filesystem.
 *
 * Artifacts are saved to ``storageDir/artifacts/taskId/artifactId/filename``.
 * Messages are saved to ``storageDir/messages/messageId/filename``.
 */
export class LocalFileStore implements FileStore {
    private static readonly DEFAULT_MAX_REMOTE_BYTES = 10 * 1024 * 1024;
    private static readonly DEFAULT_MAX_REDIRECTS = 5;
    private static readonly BLOCKED_HOSTNAMES = new Set([
        "localhost",
        "localhost.localdomain",
        "metadata.google.internal",
        "instance-data",
        "instance-data.ec2.internal",
    ]);
    private static readonly BLOCKED_IPV4_RANGES = LocalFileStore.createBlockedIpv4Ranges();
    private static readonly BLOCKED_IPV6_RANGES = LocalFileStore.createBlockedIpv6Ranges();

    private readonly storageDir: string;
    private readonly artifactRoot: string;
    private readonly messageRoot: string;
    private readonly fetchFileUri: LocalFileStoreFetchFileUri;
    private readonly allowedUriSchemes: Set<string>;
    private readonly maxRemoteBytes: number;

    constructor(storageDir: string, options: LocalFileStoreOptions = {}) {
        this.storageDir = safeJoin(storageDir);
        this.artifactRoot = safeJoin(this.storageDir, "artifacts");
        this.messageRoot = safeJoin(this.storageDir, "messages");
        this.allowedUriSchemes = new Set(normalizeAllowedUriSchemes(options.allowedUriSchemes));
        this.maxRemoteBytes =
            typeof options.maxRemoteBytes === "number" &&
            Number.isFinite(options.maxRemoteBytes) &&
            options.maxRemoteBytes > 0
                ? Math.floor(options.maxRemoteBytes)
                : LocalFileStore.DEFAULT_MAX_REMOTE_BYTES;
        this.fetchFileUri = options.fetchFileUri ?? ((uri) => this.defaultFetchFileUri(uri));
        // Ensure storage dir exists (async in constructor, matching Python)
        fs.mkdir(this.storageDir, { recursive: true }).catch(() => {});
    }

    /**
     * Save file parts from an artifact to disk.
     *
     * Returns list of local file paths where files were saved.
     */
    async saveArtifact(taskId: string, artifact: Artifact): Promise<string[]> {
        const dir = this.getArtifactDir(taskId, artifact.artifactId);
        return this.saveFileParts(artifact.parts, dir);
    }

    /**
     * Get file paths for a saved artifact.
     *
     * Returns list of paths, or empty list if directory does not exist.
     */
    async getArtifact(taskId: string, artifactId: string): Promise<string[]> {
        const dir = this.getArtifactDir(taskId, artifactId);
        return this.listFiles(dir);
    }

    /** Delete saved files for an artifact. */
    async deleteArtifact(taskId: string, artifactId: string): Promise<void> {
        const dir = this.getArtifactDir(taskId, artifactId);
        await this.removeDir(dir);
    }

    /**
     * Save file parts from a message to disk.
     *
     * Returns list of local file paths where files were saved.
     */
    async saveMessage(message: Message): Promise<string[]> {
        const dir = this.getMessageDir(message.messageId);
        return this.saveFileParts(message.parts, dir);
    }

    /**
     * Get file paths for a saved message.
     *
     * Returns list of paths, or empty list if directory does not exist.
     */
    async getMessage(messageId: string): Promise<string[]> {
        const dir = this.getMessageDir(messageId);
        return this.listFiles(dir);
    }

    /** Delete saved files for a message. */
    async deleteMessage(messageId: string): Promise<void> {
        const dir = this.getMessageDir(messageId);
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
            const filePath = safeJoin(targetDir, name);

            if ("bytes" in fileObj) {
                const data = Buffer.from(fileObj.bytes, "base64");
                await fs.writeFile(filePath, data);
            } else if ("uri" in fileObj) {
                const buffer = await this.fetchRemoteFilePart((fileObj as FileWithUri).uri);
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
                const filePath = safeJoin(dir, entry);
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

    private getArtifactDir(taskId: string, artifactId: string): string {
        assertSafeStorageId("task id", taskId);
        assertSafeStorageId("artifact id", artifactId);
        return safeJoin(this.artifactRoot, taskId, artifactId);
    }

    private getMessageDir(messageId: string): string {
        assertSafeStorageId("message id", messageId);
        return safeJoin(this.messageRoot, messageId);
    }

    private async fetchRemoteFilePart(uri: string): Promise<Buffer> {
        const url = this.parseRemoteUrl(uri);
        const bytes = await this.fetchFileUri(url.toString());
        const buffer = bytes instanceof ArrayBuffer ? Buffer.from(bytes) : Buffer.from(bytes);
        if (buffer.length > this.maxRemoteBytes) {
            throw new Error(
                `Remote file exceeds maxRemoteBytes ${this.maxRemoteBytes}: ${buffer.length} bytes`,
            );
        }
        return buffer;
    }

    private async defaultFetchFileUri(uri: string): Promise<Buffer> {
        const visited = new Set<string>();
        let currentUrl = this.parseRemoteUrl(uri);

        for (
            let redirectCount = 0;
            redirectCount <= LocalFileStore.DEFAULT_MAX_REDIRECTS;
            redirectCount++
        ) {
            const currentUrlString = currentUrl.toString();
            if (visited.has(currentUrlString)) {
                throw new Error(`Redirect loop while fetching '${uri}'`);
            }
            visited.add(currentUrlString);

            const resolvedAddress = await this.resolveRemoteAddress(currentUrl);
            const response = await this.requestRemoteUrl(currentUrl, resolvedAddress);
            const statusCode = response.statusCode ?? 0;

            if (LocalFileStore.isRedirectStatus(statusCode)) {
                const location = this.getHeaderValue(response.headers.location);
                response.resume();
                if (!location) {
                    throw new Error(`Redirect response missing location for '${currentUrlString}'`);
                }
                currentUrl = this.parseRemoteUrl(location, currentUrl);
                continue;
            }

            if (statusCode < 200 || statusCode >= 300) {
                response.resume();
                throw new Error(`HTTP ${statusCode}: ${response.statusMessage ?? ""}`.trim());
            }

            const contentLength = this.getHeaderValue(response.headers["content-length"]);
            if (contentLength) {
                const length = Number(contentLength);
                if (Number.isFinite(length) && length > this.maxRemoteBytes) {
                    throw new Error(
                        `Remote file exceeds maxRemoteBytes ${this.maxRemoteBytes}: ${length} bytes`,
                    );
                }
            }

            const body = await this.readResponseWithLimit(response);
            return await this.decodeResponseBody(
                body,
                this.getHeaderValue(response.headers["content-encoding"]),
            );
        }

        throw new Error(`Too many redirects while fetching '${uri}'`);
    }

    private parseRemoteUrl(uri: string, base?: URL): URL {
        return parseRemoteFileUri(uri, {
            allowedSchemes: this.allowedUriSchemes,
            base,
        });
    }

    private async resolveRemoteAddress(url: URL): Promise<ResolvedRemoteAddress> {
        const hostname = LocalFileStore.normalizeHostToken(url.hostname);
        if (LocalFileStore.isBlockedHost(hostname) || LocalFileStore.isBlockedIpAddress(hostname)) {
            throw new Error(`Blocked remote file host: '${hostname}'`);
        }

        const lookupResults = await dns
            .lookup(hostname, { all: true, verbatim: true })
            .catch(() => {
                throw new Error(`Failed to resolve remote file host: '${hostname}'`);
            });
        if (lookupResults.length === 0) {
            throw new Error(`Failed to resolve remote file host: '${hostname}'`);
        }
        for (const result of lookupResults) {
            if (LocalFileStore.isBlockedIpAddress(result.address)) {
                throw new Error(`Blocked remote file host: '${hostname}'`);
            }
        }

        const approved = lookupResults[0];
        return {
            address: approved.address,
            family: approved.family === 6 ? 6 : 4,
        };
    }

    private async requestRemoteUrl(
        url: URL,
        resolvedAddress: ResolvedRemoteAddress,
    ): Promise<http.IncomingMessage> {
        const client = url.protocol === "https:" ? https : http;
        const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
        const requestPath = `${url.pathname}${url.search}` || "/";
        const servername =
            url.protocol === "https:" ? LocalFileStore.normalizeHostToken(url.hostname) : undefined;

        return await new Promise((resolve, reject) => {
            const request = client.request(
                {
                    family: resolvedAddress.family,
                    headers: {
                        Accept: "*/*",
                        "Accept-Encoding": "identity",
                        Connection: "close",
                        Host: url.host,
                    },
                    hostname: resolvedAddress.address,
                    method: "GET",
                    path: requestPath,
                    port,
                    servername,
                },
                resolve,
            );
            request.on("error", reject);
            request.end();
        });
    }

    private async readResponseWithLimit(response: http.IncomingMessage): Promise<Buffer> {
        return await new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            let total = 0;

            response.on("data", (chunk: Buffer | string) => {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                total += buffer.length;
                if (total > this.maxRemoteBytes) {
                    response.destroy(
                        new Error(
                            `Remote file exceeds maxRemoteBytes ${this.maxRemoteBytes}: ${total} bytes`,
                        ),
                    );
                    return;
                }
                chunks.push(buffer);
            });
            response.on("end", () => resolve(Buffer.concat(chunks, total)));
            response.on("error", reject);
        });
    }

    private async decodeResponseBody(
        body: Buffer,
        contentEncoding: string | undefined,
    ): Promise<Buffer> {
        let decoded = body;
        const encodings = LocalFileStore.parseContentEncodings(contentEncoding);

        for (let i = encodings.length - 1; i >= 0; i--) {
            decoded = await this.decodeResponseBodyOnce(decoded, encodings[i]);
        }

        return decoded;
    }

    private async decodeResponseBodyOnce(body: Buffer, encoding: string): Promise<Buffer> {
        if (encoding === "identity") {
            return body;
        }

        const decoder = this.createContentDecoder(encoding);
        const source = Readable.from(LocalFileStore.chunkBuffer(body));
        source.pipe(decoder);

        const chunks: Buffer[] = [];
        let total = 0;

        try {
            for await (const chunk of decoder) {
                const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                total += buffer.length;
                if (total > this.maxRemoteBytes) {
                    const error = new Error(
                        `Remote file exceeds maxRemoteBytes ${this.maxRemoteBytes}: ${total} bytes`,
                    );
                    source.destroy(error);
                    decoder.destroy(error);
                    throw error;
                }
                chunks.push(buffer);
            }
        } catch (error) {
            source.destroy();
            throw error;
        }

        return Buffer.concat(chunks, total);
    }

    private getHeaderValue(value: string | string[] | undefined): string | undefined {
        if (Array.isArray(value)) {
            return value[0];
        }
        return value;
    }

    private createContentDecoder(encoding: string) {
        if (encoding === "gzip" || encoding === "x-gzip" || encoding === "deflate") {
            return createUnzip();
        }
        if (encoding === "br") {
            return createBrotliDecompress();
        }
        throw new Error(`Unsupported remote file content encoding: '${encoding}'`);
    }

    private static createBlockedIpv4Ranges(): BlockList {
        const ranges = new BlockList();
        ranges.addSubnet("0.0.0.0", 8, "ipv4");
        ranges.addSubnet("10.0.0.0", 8, "ipv4");
        ranges.addSubnet("100.64.0.0", 10, "ipv4");
        ranges.addSubnet("127.0.0.0", 8, "ipv4");
        ranges.addSubnet("169.254.0.0", 16, "ipv4");
        ranges.addSubnet("172.16.0.0", 12, "ipv4");
        ranges.addSubnet("192.0.0.0", 24, "ipv4");
        ranges.addSubnet("192.0.2.0", 24, "ipv4");
        ranges.addSubnet("192.168.0.0", 16, "ipv4");
        ranges.addSubnet("198.18.0.0", 15, "ipv4");
        ranges.addSubnet("198.51.100.0", 24, "ipv4");
        ranges.addSubnet("203.0.113.0", 24, "ipv4");
        ranges.addSubnet("224.0.0.0", 4, "ipv4");
        ranges.addSubnet("240.0.0.0", 4, "ipv4");
        return ranges;
    }

    private static createBlockedIpv6Ranges(): BlockList {
        const ranges = new BlockList();
        ranges.addAddress("::", "ipv6");
        ranges.addAddress("::1", "ipv6");
        ranges.addSubnet("fc00::", 7, "ipv6");
        ranges.addSubnet("fe80::", 10, "ipv6");
        ranges.addSubnet("fec0::", 10, "ipv6");
        return ranges;
    }

    private static parseContentEncodings(value: string | undefined): string[] {
        if (!value) {
            return [];
        }
        return value
            .split(",")
            .map((entry) => entry.trim().toLowerCase())
            .filter((entry) => entry.length > 0);
    }

    private static *chunkBuffer(buffer: Buffer): Iterable<Buffer> {
        const chunkSize = 64 * 1024;
        for (let offset = 0; offset < buffer.length; offset += chunkSize) {
            yield buffer.subarray(offset, Math.min(offset + chunkSize, buffer.length));
        }
    }

    private static normalizeHostToken(value: string): string {
        let normalized = value.trim().toLowerCase();
        if (normalized.startsWith("[") && normalized.endsWith("]")) {
            normalized = normalized.slice(1, -1);
        }
        return normalized.replace(/\.+$/, "");
    }

    private static looksLikeUnsupportedIpv4Literal(address: string): boolean {
        const parts = address.split(".");
        if (parts.length === 0 || parts.length > 4) {
            return false;
        }
        if (parts.some((part) => part.length === 0)) {
            return true;
        }
        return parts.every((part) => /^[0-9]+$/.test(part) || /^0x/i.test(part));
    }

    private static extractMappedIpv4(address: string): string | null {
        const normalized = LocalFileStore.normalizeHostToken(address);
        const dottedMatch = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(normalized);
        if (dottedMatch) {
            return dottedMatch[1];
        }

        const hexMatch = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(normalized);
        if (!hexMatch) {
            return null;
        }

        const upper = Number.parseInt(hexMatch[1], 16);
        const lower = Number.parseInt(hexMatch[2], 16);
        if (!Number.isFinite(upper) || !Number.isFinite(lower)) {
            return null;
        }

        return `${(upper >> 8) & 0xff}.${upper & 0xff}.${(lower >> 8) & 0xff}.${lower & 0xff}`;
    }

    private static isBlockedHost(hostname: string): boolean {
        const normalized = LocalFileStore.normalizeHostToken(hostname);
        if (!normalized) {
            return true;
        }
        if (LocalFileStore.BLOCKED_HOSTNAMES.has(normalized)) {
            return true;
        }
        if (
            normalized.endsWith(".localhost") ||
            normalized.endsWith(".local") ||
            normalized.endsWith(".internal")
        ) {
            return true;
        }
        if (isIP(normalized) === 0 && LocalFileStore.looksLikeUnsupportedIpv4Literal(normalized)) {
            return true;
        }
        return false;
    }

    private static isBlockedIpAddress(address: string): boolean {
        const normalized = LocalFileStore.normalizeHostToken(address);
        if (!normalized) {
            return true;
        }

        const mappedIpv4 = LocalFileStore.extractMappedIpv4(normalized);
        if (mappedIpv4) {
            return LocalFileStore.BLOCKED_IPV4_RANGES.check(mappedIpv4, "ipv4");
        }

        const family = isIP(normalized);
        if (family === 4) {
            return LocalFileStore.BLOCKED_IPV4_RANGES.check(normalized, "ipv4");
        }
        if (family === 6) {
            return LocalFileStore.BLOCKED_IPV6_RANGES.check(normalized, "ipv6");
        }
        return normalized.includes(":");
    }

    private static isRedirectStatus(status: number): boolean {
        return (
            status === 301 || status === 302 || status === 303 || status === 307 || status === 308
        );
    }
}

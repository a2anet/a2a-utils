// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { DataArtifacts } from "../src/artifacts/data.js";
import { TextArtifacts } from "../src/artifacts/text.js";

describe("evaluateJsonPath", () => {
    test("empty path", () => {
        const data = { a: 1 };
        expect((DataArtifacts as any).evaluateJsonPath(data, "")).toEqual(data);
    });

    test("single field", () => {
        expect((DataArtifacts as any).evaluateJsonPath({ a: 1, b: 2 }, "a")).toBe(1);
    });

    test("nested field", () => {
        const data = { a: { b: { c: 42 } } };
        expect((DataArtifacts as any).evaluateJsonPath(data, "a.b.c")).toBe(42);
    });

    test("field not found", () => {
        expect(() => (DataArtifacts as any).evaluateJsonPath({ a: 1 }, "z")).toThrow("not found");
    });

    test("access on non-dict", () => {
        expect(() => (DataArtifacts as any).evaluateJsonPath({ a: [1, 2] }, "a.b")).toThrow(
            "Cannot access field",
        );
    });

    test("returns list", () => {
        const data = { items: [1, 2, 3] };
        expect((DataArtifacts as any).evaluateJsonPath(data, "items")).toEqual([1, 2, 3]);
    });
});

describe("parseLineRange", () => {
    test("defaults", () => {
        expect((TextArtifacts as any).parseLineRange(null, null, 10)).toEqual([0, 10]);
    });

    test("specific range", () => {
        expect((TextArtifacts as any).parseLineRange(1, 5, 10)).toEqual([0, 5]);
    });

    test("single line", () => {
        expect((TextArtifacts as any).parseLineRange(3, 3, 10)).toEqual([2, 3]);
    });

    test("negative start", () => {
        expect((TextArtifacts as any).parseLineRange(-1, null, 10)).toEqual([9, 10]);
    });

    test("negative end", () => {
        expect((TextArtifacts as any).parseLineRange(1, -1, 10)).toEqual([0, 10]);
    });

    test("start less than 1", () => {
        expect(() => (TextArtifacts as any).parseLineRange(0, 5, 10)).toThrow("must be >= 1");
    });

    test("end exceeds total", () => {
        expect(() => (TextArtifacts as any).parseLineRange(1, 20, 10)).toThrow("exceeds total lines");
    });

    test("start greater than end", () => {
        expect(() => (TextArtifacts as any).parseLineRange(5, 3, 10)).toThrow("must be <=");
    });
});

// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { DataArtifacts } from "../src/artifacts/data.js";
import { TextArtifacts } from "../src/artifacts/text.js";
import { getDataArtifactsStatics, getTextArtifactsStatics } from "./internal-access.js";

const dataArtifacts = getDataArtifactsStatics(DataArtifacts);
const textArtifacts = getTextArtifactsStatics(TextArtifacts);

describe("evaluateJsonPath", () => {
    test("empty path", () => {
        const data = { a: 1 };
        expect(dataArtifacts.evaluateJsonPath(data, "")).toEqual(data);
    });

    test("single field", () => {
        expect(dataArtifacts.evaluateJsonPath({ a: 1, b: 2 }, "a")).toBe(1);
    });

    test("nested field", () => {
        const data = { a: { b: { c: 42 } } };
        expect(dataArtifacts.evaluateJsonPath(data, "a.b.c")).toBe(42);
    });

    test("field not found", () => {
        expect(() => dataArtifacts.evaluateJsonPath({ a: 1 }, "z")).toThrow("not found");
    });

    test("access on non-dict", () => {
        expect(() => dataArtifacts.evaluateJsonPath({ a: [1, 2] }, "a.b")).toThrow(
            "Cannot access field",
        );
    });

    test("returns list", () => {
        const data = { items: [1, 2, 3] };
        expect(dataArtifacts.evaluateJsonPath(data, "items")).toEqual([1, 2, 3]);
    });
});

describe("parseLineRange", () => {
    test("defaults", () => {
        expect(textArtifacts.parseLineRange(null, null, 10)).toEqual([0, 10]);
    });

    test("specific range", () => {
        expect(textArtifacts.parseLineRange(1, 5, 10)).toEqual([0, 5]);
    });

    test("single line", () => {
        expect(textArtifacts.parseLineRange(3, 3, 10)).toEqual([2, 3]);
    });

    test("negative start", () => {
        expect(textArtifacts.parseLineRange(-1, null, 10)).toEqual([9, 10]);
    });

    test("negative end", () => {
        expect(textArtifacts.parseLineRange(1, -1, 10)).toEqual([0, 10]);
    });

    test("start less than 1", () => {
        expect(() => textArtifacts.parseLineRange(0, 5, 10)).toThrow("must be >= 1");
    });

    test("end exceeds total", () => {
        expect(() => textArtifacts.parseLineRange(1, 20, 10)).toThrow("exceeds total lines");
    });

    test("start greater than end", () => {
        expect(() => textArtifacts.parseLineRange(5, 3, 10)).toThrow("must be <=");
    });
});

// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { DataArtifacts } from "../src/artifacts/data.js";
import { getDataArtifactsStatics } from "./internal-access.js";

const dataArtifacts = getDataArtifactsStatics(DataArtifacts);

describe("parseRowSelection", () => {
    test("single int", () => {
        expect(dataArtifacts.parseRowSelection(0, 5)).toEqual([0]);
        expect(dataArtifacts.parseRowSelection(4, 5)).toEqual([4]);
    });

    test("negative index", () => {
        expect(dataArtifacts.parseRowSelection(-1, 5)).toEqual([4]);
        expect(dataArtifacts.parseRowSelection(-3, 5)).toEqual([2]);
    });

    test("out of range", () => {
        expect(() => dataArtifacts.parseRowSelection(5, 5)).toThrow("out of range");
    });

    test("negative out of range", () => {
        expect(() => dataArtifacts.parseRowSelection(-6, 5)).toThrow("out of range");
    });

    test("list of ints", () => {
        expect(dataArtifacts.parseRowSelection([0, 2, 4], 5)).toEqual([0, 2, 4]);
    });

    test("list with negative", () => {
        expect(dataArtifacts.parseRowSelection([0, -1], 5)).toEqual([0, 4]);
    });

    test("list out of range", () => {
        expect(() => dataArtifacts.parseRowSelection([0, 10], 5)).toThrow("out of range");
    });

    test("all string", () => {
        expect(dataArtifacts.parseRowSelection("all", 3)).toEqual([0, 1, 2]);
    });

    test("range string", () => {
        expect(dataArtifacts.parseRowSelection("0-3", 5)).toEqual([0, 1, 2]);
    });

    test("range string full", () => {
        expect(dataArtifacts.parseRowSelection("0-5", 5)).toEqual([0, 1, 2, 3, 4]);
    });

    test("range invalid start", () => {
        expect(() => dataArtifacts.parseRowSelection("10-20", 5)).toThrow("out of range");
    });

    test("range start greater than end", () => {
        expect(() => dataArtifacts.parseRowSelection("3-1", 5)).toThrow("greater than");
    });

    test("invalid string", () => {
        expect(() => dataArtifacts.parseRowSelection("foo", 5)).toThrow("Invalid row selection");
    });

    test("invalid type", () => {
        expect(() => dataArtifacts.parseRowSelection({} as unknown as number, 5)).toThrow(
            "Invalid row selection type",
        );
    });
});

describe("parseColumnSelection", () => {
    test("all string", () => {
        const cols = ["a", "b", "c"];
        expect(dataArtifacts.parseColumnSelection("all", cols)).toEqual(cols);
    });

    test("single column", () => {
        expect(dataArtifacts.parseColumnSelection("b", ["a", "b", "c"])).toEqual(["b"]);
    });

    test("column not found", () => {
        expect(() => dataArtifacts.parseColumnSelection("z", ["a", "b"])).toThrow("not found");
    });

    test("list of columns", () => {
        expect(dataArtifacts.parseColumnSelection(["a", "c"], ["a", "b", "c"])).toEqual(["a", "c"]);
    });

    test("list column not found", () => {
        expect(() => dataArtifacts.parseColumnSelection(["a", "z"], ["a", "b"])).toThrow(
            "not found",
        );
    });

    test("invalid type", () => {
        expect(() => dataArtifacts.parseColumnSelection(123 as unknown as string, ["a"])).toThrow(
            "Invalid column selection type",
        );
    });
});

describe("filterDataByRowsAndColumns", () => {
    test("basic filter", () => {
        const data = [
            { a: 1, b: 2, c: 3 },
            { a: 4, b: 5, c: 6 },
            { a: 7, b: 8, c: 9 },
        ];
        const result = dataArtifacts.filterDataByRowsAndColumns(data, [0, 2], ["a", "c"]);
        expect(result).toEqual([
            { a: 1, c: 3 },
            { a: 7, c: 9 },
        ]);
    });

    test("out of bounds row skipped", () => {
        const data = [{ a: 1 }];
        const result = dataArtifacts.filterDataByRowsAndColumns(data, [0, 5], ["a"]);
        expect(result).toEqual([{ a: 1 }]);
    });

    test("missing column skipped", () => {
        const data = [{ a: 1, b: 2 }];
        const result = dataArtifacts.filterDataByRowsAndColumns(data, [0], ["a", "z"]);
        expect(result).toEqual([{ a: 1 }]);
    });

    test("empty data", () => {
        const result = dataArtifacts.filterDataByRowsAndColumns([], [0], ["a"]);
        expect(result).toEqual([]);
    });
});

describe("DataArtifacts.view", () => {
    test("plain data passthrough", () => {
        const data = { key: "value" };
        const result = DataArtifacts.view(data);
        expect(result).toEqual({ key: "value" });
    });

    test("list with rows and columns", () => {
        const data = [
            { a: 1, b: 2, c: 3 },
            { a: 4, b: 5, c: 6 },
            { a: 7, b: 8, c: 9 },
        ];
        const result = DataArtifacts.view(data, { rows: [0, 2], columns: ["a", "c"] });
        expect(result).toEqual([
            { a: 1, c: 3 },
            { a: 7, c: 9 },
        ]);
    });

    test("json path then filter", () => {
        const data = {
            items: [
                { name: "Alice", age: 30 },
                { name: "Bob", age: 25 },
            ],
        };
        const result = DataArtifacts.view(data, {
            jsonPath: "items",
            rows: 0,
            columns: "name",
        });
        expect(result).toEqual([{ name: "Alice" }]);
    });

    test("character limit exceeded", () => {
        const data = Array.from({ length: 10 }, () => ({ a: "x".repeat(10_000) }));
        expect(() => DataArtifacts.view(data, { characterLimit: 100 })).toThrow("exceeds");
    });
});

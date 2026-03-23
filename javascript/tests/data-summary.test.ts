// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { DataArtifacts } from "../src/artifacts/data.js";

describe("summarizeValues", () => {
    test("empty list", () => {
        const result = DataArtifacts.summarizeValues([]);
        expect(result).toEqual({ count: 0, types: [] });
    });

    test("integers", () => {
        const values = Array.from({ length: 100 }, (_, i) => i);
        const result = DataArtifacts.summarizeValues(values);
        expect(!Array.isArray(result)).toBe(true);
        const summary = result as Record<string, unknown>;
        expect(summary.count).toBe(100);
        expect(summary.unique_count).toBe(100);
        const types = summary.types as Record<string, unknown>[];
        expect(types.length).toBe(1);
        expect(types[0].name).toBe("int");
        expect(types[0].minimum).toBe(0);
        expect(types[0].maximum).toBe(99);
    });

    test("strings", () => {
        const values = Array.from(
            { length: 100 },
            (_, i) => `employee_${String(i).padStart(4, "0")}@company.com`,
        );
        const result = DataArtifacts.summarizeValues(values);
        expect(!Array.isArray(result)).toBe(true);
        const summary = result as Record<string, unknown>;
        expect(summary.count).toBe(100);
        const types = summary.types as Record<string, unknown>[];
        expect(types[0].name).toBe("string");
        expect(types[0].length_minimum).toBe("employee_0000@company.com".length);
        expect(types[0].length_maximum).toBe("employee_0000@company.com".length);
    });

    test("mixed types", () => {
        const values = [
            ...Array.from({ length: 50 }, (_, i) => i),
            ...Array.from({ length: 30 }, (_, i) => `str_${i}`),
            ...Array.from({ length: 20 }, () => null),
        ];
        const result = DataArtifacts.summarizeValues(values);
        expect(!Array.isArray(result)).toBe(true);
        const summary = result as Record<string, unknown>;
        expect(summary.count).toBe(100);
        const typeNames = new Set((summary.types as Record<string, unknown>[]).map((t) => t.name));
        expect(typeNames).toEqual(new Set(["int", "string", "null"]));
    });

    test("booleans not counted as int", () => {
        const values = [
            ...Array.from({ length: 100 }, (_, i) => i % 2 === 0),
            ...Array.from({ length: 50 }, (_, i) => i),
        ];
        const result = DataArtifacts.summarizeValues(values);
        expect(!Array.isArray(result)).toBe(true);
        const summary = result as Record<string, unknown>;
        const typeNames = new Set((summary.types as Record<string, unknown>[]).map((t) => t.name));
        expect(typeNames.has("bool")).toBe(true);
        expect(typeNames.has("int")).toBe(true);
    });

    test("objects", () => {
        const values = Array.from({ length: 100 }, (_, i) => ({
            key: `value_${i}`,
            score: i * 1.5,
        }));
        const result = DataArtifacts.summarizeValues(values);
        expect(!Array.isArray(result)).toBe(true);
        const summary = result as Record<string, unknown>;
        const types = summary.types as Record<string, unknown>[];
        expect(types[0].name).toBe("object");
        expect(types[0].json_length_minimum).toBeDefined();
    });

    test("lists", () => {
        const values = Array.from({ length: 100 }, (_, i) =>
            Array.from({ length: 5 }, (_, j) => i + j),
        );
        const result = DataArtifacts.summarizeValues(values);
        expect(!Array.isArray(result)).toBe(true);
        const summary = result as Record<string, unknown>;
        const types = summary.types as Record<string, unknown>[];
        expect(types[0].name).toBe("list");
        expect(types[0].length_minimum).toBe(5);
        expect(types[0].length_maximum).toBe(5);
    });

    test("unique count with dicts", () => {
        // 50 unique dicts, each duplicated = 100 total, 50 unique
        const base = Array.from({ length: 50 }, (_, i) => ({ a: i }));
        const values = [...base, ...base];
        const result = DataArtifacts.summarizeValues(values);
        expect(!Array.isArray(result)).toBe(true);
        const summary = result as Record<string, unknown>;
        expect(summary.unique_count).toBe(50);
    });
});

describe("summarizeValues inflation guard", () => {
    test("small int list returns original", () => {
        const values = [1, 2, 3];
        const result = DataArtifacts.summarizeValues(values);
        expect(result).toEqual([1, 2, 3]);
    });

    test("small string list returns original", () => {
        const values = ["a", "b"];
        const result = DataArtifacts.summarizeValues(values);
        expect(result).toEqual(["a", "b"]);
    });

    test("small mixed list returns original", () => {
        const values = [1, "hello", null];
        const result = DataArtifacts.summarizeValues(values);
        expect(result).toEqual([1, "hello", null]);
    });

    test("large list returns summary", () => {
        const values = Array.from({ length: 200 }, (_, i) => i);
        const result = DataArtifacts.summarizeValues(values);
        expect(!Array.isArray(result)).toBe(true);
        expect((result as Record<string, unknown>).count).toBeDefined();
    });
});

describe("summarizeTable", () => {
    test("empty data", () => {
        expect(DataArtifacts.summarizeTable([])).toEqual([]);
    });

    test("basic table", () => {
        const data = Array.from({ length: 50 }, (_, i) => ({
            name: `Employee ${i}`,
            salary: 50000 + i * 500,
        }));
        const result = DataArtifacts.summarizeTable(data);
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);

        const colNames = new Set(result.map((col) => col.name));
        expect(colNames).toEqual(new Set(["name", "salary"]));
    });

    test("sparse data", () => {
        const data: Record<string, unknown>[] = [];
        for (let i = 0; i < 50; i++) {
            const row: Record<string, unknown> = { a: i * 100 };
            if (i % 2 === 0) row.b = `even_${i}`;
            if (i % 3 === 0) row.c = i * 0.5;
            data.push(row);
        }
        const result = DataArtifacts.summarizeTable(data);
        expect(Array.isArray(result)).toBe(true);
        const colNames = result.map((col) => col.name);
        expect(colNames).toContain("a");
        expect(colNames).toContain("b");
        expect(colNames).toContain("c");
    });

    test("column counts", () => {
        const data = Array.from({ length: 100 }, (_, i) => ({ x: i * 10 }));
        const result = DataArtifacts.summarizeTable(data);
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].count).toBe(100);
    });
});

describe("summarizeTable inflation guard", () => {
    test("small table returns original", () => {
        const data = [
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 },
        ];
        const result = DataArtifacts.summarizeTable(data);
        expect(result).toEqual(data);
    });

    test("large table returns summary", () => {
        const data = Array.from({ length: 50 }, (_, i) => ({
            name: `Employee ${i}`,
            salary: 50000 + i * 500,
        }));
        const result = DataArtifacts.summarizeTable(data);
        expect(Array.isArray(result)).toBe(true);
        expect(result.every((col) => typeof col === "object")).toBe(true);
        const colNames = new Set(result.map((col) => col.name));
        expect(colNames).toEqual(new Set(["name", "salary"]));
    });

    test("mixed columns raw and summarized", () => {
        const data = Array.from({ length: 30 }, (_, i) => ({
            id: i,
            bio: `This is a biography for person ${i} with lots of detail about their career and achievements.`,
        }));
        const result = DataArtifacts.summarizeTable(data);
        expect(Array.isArray(result)).toBe(true);
        const idCol = result.find((col) => col.name === "id")!;
        const bioCol = result.find((col) => col.name === "bio")!;
        // id column may have raw values (small ints), bio column should be summarized
        if ("values" in idCol) {
            expect(idCol.values).toEqual(Array.from({ length: 30 }, (_, i) => i));
        } else {
            expect(idCol.count).toBeDefined();
        }
        expect(bioCol.count).toBeDefined();
    });
});

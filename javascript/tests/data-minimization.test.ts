// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from "bun:test";
import { DataArtifacts } from "../src/artifacts/data.js";
import { TextArtifacts } from "../src/artifacts/text.js";

describe("minimizeText", () => {
    test("short text", () => {
        const result = TextArtifacts.minimize("Hello");
        expect(result).toEqual({ text: "Hello" });
    });

    test("long text truncated", () => {
        const text = "x".repeat(51_000);
        const result = TextArtifacts.minimize(text);
        expect(typeof result.text).toBe("string");
        expect(result.text as string).toContain("characters omitted");
        expect(result._total_lines).toBeDefined();
        expect(result._total_characters).toBe(51_000);
        expect(result._start_line_range).toBeDefined();
        expect(result._end_line_range).toBeDefined();
        expect(result._start_character_range).toBe("0-25000");
        expect(result._end_character_range).toBe("26000-51000");
    });

    test("default no tip", () => {
        const text = "x".repeat(51_000);
        const result = TextArtifacts.minimize(text);
        expect(result._tip).toBeUndefined();
    });

    test("custom tip", () => {
        const text = "x".repeat(51_000);
        const result = TextArtifacts.minimize(text, { tip: "Custom tip." });
        expect(result._tip).toBe("Custom tip.");
    });

    test("empty tip omitted", () => {
        const text = "x".repeat(51_000);
        const result = TextArtifacts.minimize(text, { tip: null });
        expect(result._tip).toBeUndefined();
    });

    test("custom character limit", () => {
        const text = "x".repeat(200);
        const resultDefault = TextArtifacts.minimize(text);
        expect(resultDefault).toEqual({ text });

        const resultCustom = TextArtifacts.minimize(text, { characterLimit: 100 });
        expect(typeof resultCustom.text).toBe("string");
        expect(resultCustom.text as string).toContain("characters omitted");
    });
});

describe("minimizeObject", () => {
    test("small object", () => {
        const obj = { key: "value" };
        const result = (DataArtifacts as any).minimizeObject(obj);
        expect(result).toEqual({ data: { key: "value" } });
    });

    test("large object truncates strings", () => {
        const obj = { key: "x".repeat(20_000), key2: "y".repeat(20_000), key3: "z".repeat(20_000) };
        const result = (DataArtifacts as any).minimizeObject(obj);
        expect((result.data as Record<string, unknown>)._tip).toBeUndefined();
        expect((result.data as Record<string, unknown>).key as string).toContain("more chars");
    });

    test("custom tip", () => {
        const obj = { key: "x".repeat(20_000), key2: "y".repeat(20_000), key3: "z".repeat(20_000) };
        const result = (DataArtifacts as any).minimizeObject(obj, { tip: "Custom tip here" });
        expect((result.data as Record<string, unknown>)._tip).toBe("Custom tip here");
    });

    test("empty tip omitted", () => {
        const obj = { key: "x".repeat(20_000), key2: "y".repeat(20_000), key3: "z".repeat(20_000) };
        const result = (DataArtifacts as any).minimizeObject(obj, { tip: null });
        expect((result.data as Record<string, unknown>)._tip).toBeUndefined();
    });

    test("custom character limit", () => {
        const obj = { key: "x".repeat(1000) };
        const result = (DataArtifacts as any).minimizeObject(obj, {
            characterLimit: 50,
            minimizedObjectStringLength: 50,
        });
        expect((result.data as Record<string, unknown>)._tip).toBeUndefined();
    });

    test("inflation guard", () => {
        const obj = { key: "short" };
        const result = (DataArtifacts as any).minimizeObject(obj, { characterLimit: 5 });
        expect(result).toEqual({ data: { key: "short" } });
    });
});

describe("minimizeData", () => {
    test("small data passthrough", () => {
        const result = DataArtifacts.minimize({ key: "val" });
        expect(result).toEqual({ data: { key: "val" } });
    });

    test("string data", () => {
        const text = "x".repeat(51_000);
        const result = DataArtifacts.minimize(text);
        expect(result.text).toBeDefined();
    });

    test("list of objects", () => {
        const data = Array.from({ length: 200 }, () => ({ a: "x".repeat(500) }));
        const result = DataArtifacts.minimize(data);
        expect((result.data as Record<string, unknown>)._total_rows).toBeDefined();
    });

    test("list of objects has columns", () => {
        const data = Array.from({ length: 200 }, (_, i) => ({
            a: "x".repeat(500),
            b: `value-${i}`,
        }));
        const result = DataArtifacts.minimize(data);
        expect((result.data as Record<string, unknown>)._total_rows).toBeDefined();
        expect((result.data as Record<string, unknown>)._columns).toBeDefined();
    });

    test("list of objects no default tip", () => {
        const data = Array.from({ length: 200 }, () => ({ a: "x".repeat(500) }));
        const result = DataArtifacts.minimize(data);
        expect((result.data as Record<string, unknown>)._tip).toBeUndefined();
    });

    test("list of objects custom tip", () => {
        const data = Array.from({ length: 200 }, () => ({ a: "x".repeat(500) }));
        const result = DataArtifacts.minimize(data, { tip: "Custom table tip" });
        expect((result.data as Record<string, unknown>)._tip).toBe("Custom table tip");
    });

    test("list of objects no tip", () => {
        const data = Array.from({ length: 200 }, () => ({ a: "x".repeat(500) }));
        const result = DataArtifacts.minimize(data, { tip: null });
        expect((result.data as Record<string, unknown>)._tip).toBeUndefined();
    });

    test("list of objects inflation guard", () => {
        const data = [{ a: 1 }, { a: 2 }];
        const result = DataArtifacts.minimize(data);
        expect(result).toEqual({ data });
    });

    test("empty list", () => {
        const result = DataArtifacts.minimize([]);
        expect(result).toEqual({ data: [] });
    });

    test("primitive", () => {
        const result = DataArtifacts.minimize(42);
        expect(result).toEqual({ data: 42 });
    });

    test("large list no default tip", () => {
        const data = Array.from({ length: 200 }, () => ({ a: "x".repeat(500) }));
        const result = DataArtifacts.minimize(data);
        expect((result.data as Record<string, unknown>)._tip).toBeUndefined();
    });
});

describe("minimizeObjectValues inflation guard", () => {
    test("small nested list of dicts preserved", () => {
        const obj = {
            title: "x".repeat(20_000),
            items: [{ a: 1 }, { a: 2 }],
        };
        const result = (DataArtifacts as any).minimizeObject(obj, {
            characterLimit: 10,
            minimizedObjectStringLength: 50,
        });
        expect((result.data as Record<string, unknown>).items).toEqual([{ a: 1 }, { a: 2 }]);
    });

    test("small nested plain list preserved", () => {
        const obj = {
            title: "x".repeat(20_000),
            tags: ["a", "b", "c"],
        };
        const result = (DataArtifacts as any).minimizeObject(obj, {
            characterLimit: 10,
            minimizedObjectStringLength: 50,
        });
        expect((result.data as Record<string, unknown>).tags).toEqual(["a", "b", "c"]);
    });

    test("large nested list of dicts summarized", () => {
        const obj = {
            title: "x".repeat(20_000),
            employees: Array.from({ length: 100 }, (_, i) => ({
                name: `Employee ${i}`,
                salary: 50000 + i * 500,
            })),
        };
        const result = (DataArtifacts as any).minimizeObject(obj, {
            characterLimit: 10,
            minimizedObjectStringLength: 50,
        });
        expect(
            (result.data as Record<string, unknown>).employees as Record<string, unknown>,
        ).toHaveProperty("_total_rows");
    });

    test("large nested plain list summarized", () => {
        const obj = {
            title: "x".repeat(20_000),
            values: Array.from(
                { length: 200 },
                (_, i) => `item_${String(i).padStart(4, "0")}_with_extra_padding`,
            ),
        };
        const result = (DataArtifacts as any).minimizeObject(obj, {
            characterLimit: 10,
            minimizedObjectStringLength: 50,
        });
        expect(
            (result.data as Record<string, unknown>).values as Record<string, unknown>,
        ).toHaveProperty("_total_items");
    });
});

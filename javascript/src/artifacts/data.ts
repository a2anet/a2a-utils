// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Data artifact viewing, minimization, selection, summary, and JSON path utilities.
 */

import { TextArtifacts } from "./text.js";

function stableStringify(v: unknown): string {
    if (v === null || v === undefined || typeof v !== "object") {
        return JSON.stringify(v);
    }
    if (Array.isArray(v)) {
        return `[${v.map(stableStringify).join(",")}]`;
    }
    const keys = Object.keys(v as Record<string, unknown>).sort();
    const pairs = keys.map(
        (k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`,
    );
    return `{${pairs.join(",")}}`;
}

function mean(values: number[]): number {
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
    const m = mean(values);
    const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance);
}

function getTypeName(v: unknown): string {
    if (v === null || v === undefined) return "null";
    if (typeof v === "boolean") return "bool";
    if (typeof v === "number") return Number.isInteger(v) ? "int" : "float";
    if (typeof v === "string") return "string";
    if (Array.isArray(v)) return "list";
    if (typeof v === "object") return "object";
    return typeof v;
}

/** Format a number with comma separators (locale-independent, matching Python's `f"{n:,}"`). */
function formatNumber(n: number): string {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function uniqueColumns(data: unknown[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of data) {
        if (item !== null && typeof item === "object" && !Array.isArray(item)) {
            for (const key of Object.keys(item as Record<string, unknown>)) {
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(key);
                }
            }
        }
    }
    return result;
}

/** Data artifact operations: viewing and minimization. */
export class DataArtifacts {
    /**
     * View structured data with optional filtering.
     *
     * @param data - The data to view.
     * @param opts.jsonPath - Optional dot-separated path to extract specific fields.
     * @param opts.rows - Optional row selection.
     * @param opts.columns - Optional column selection.
     * @param opts.characterLimit - Maximum output size in characters.
     *
     * @returns Filtered data.
     *
     * @throws Error if parameters are invalid.
     */
    static view(
        data: unknown,
        opts?: {
            jsonPath?: string | null;
            rows?: number | number[] | string | null;
            columns?: string | string[] | null;
            characterLimit?: number;
        },
    ): unknown {
        const jsonPath = opts?.jsonPath ?? null;
        const rows = opts?.rows ?? null;
        const columns = opts?.columns ?? null;
        const characterLimit = opts?.characterLimit ?? 50_000;

        let current = data;

        if (jsonPath) {
            current = DataArtifacts.evaluateJsonPath(current, jsonPath);
        }

        if (rows !== null || columns !== null) {
            if (!Array.isArray(current)) {
                const typeName = current === null ? "null" : typeof current;
                throw new Error(
                    `rows/columns parameters require list data. The data at this path is a ${typeName}. Use json_path to navigate to a list field first.`,
                );
            }

            if (current.length === 0) {
                throw new Error("Cannot filter empty list.");
            }

            const isTabular =
                current[0] !== null && typeof current[0] === "object" && !Array.isArray(current[0]);

            if (isTabular) {
                const tableData = current as Record<string, unknown>[];
                const availableColumns = uniqueColumns(tableData);

                const rowIndices = DataArtifacts.parseRowSelection(
                    rows !== null ? rows : "all",
                    current.length,
                );
                const columnNames = DataArtifacts.parseColumnSelection(
                    columns !== null ? columns : "all",
                    availableColumns,
                );

                const filteredData = DataArtifacts.filterDataByRowsAndColumns(
                    tableData,
                    rowIndices,
                    columnNames,
                );

                const outputJson = JSON.stringify(filteredData, null, 2);
                if (outputJson.length > characterLimit) {
                    throw new Error(
                        `The selection (${rowIndices.length} row(s) and ${columnNames.length} column(s)) resulted in ${formatNumber(outputJson.length)} characters, which exceeds the limit of ${formatNumber(characterLimit)} characters. Try selecting fewer rows or columns.`,
                    );
                }

                return filteredData;
            }

            if (columns !== null) {
                throw new Error(
                    "columns parameter is only valid for lists of objects. " +
                        "This list contains basic values. Use rows parameter only.",
                );
            }

            const rowIndices = DataArtifacts.parseRowSelection(
                rows !== null ? rows : "all",
                current.length,
            );

            const filteredData = rowIndices.map((i) => (current as unknown[])[i]);

            const outputJson = JSON.stringify(filteredData, null, 2);
            if (outputJson.length > characterLimit) {
                throw new Error(
                    `The selection (${rowIndices.length} item(s)) resulted in ` +
                        `${formatNumber(outputJson.length)} characters, which exceeds the limit of ` +
                        `${formatNumber(characterLimit)} characters. Try selecting fewer items.`,
                );
            }

            return filteredData;
        }

        const outputJson = JSON.stringify(current, null, 2);
        if (outputJson.length > characterLimit) {
            throw new Error(
                `Data output (${formatNumber(outputJson.length)} characters) exceeds the maximum size of ${formatNumber(characterLimit)} characters. Try using json_path to access specific fields, or rows/columns to filter list data.`,
            );
        }

        return current;
    }

    /**
     * Minimize data content for display based on type.
     *
     * @param data - The data to minimize.
     * @param opts.characterLimit - Character limit above which to minimize.
     * @param opts.minimizedObjectStringLength - Max length for string values in objects.
     * @param opts.tip - Tip to include. Defaults to null (no tip); pass a string to include one.
     *
     * @returns Minimized representation with "data" or "text" key.
     */
    static minimize(
        data: unknown,
        opts?: {
            characterLimit?: number;
            minimizedObjectStringLength?: number;
            tip?: string | null;
        },
    ): Record<string, unknown> {
        const characterLimit = opts?.characterLimit ?? 50_000;
        const minimizedObjectStringLength = opts?.minimizedObjectStringLength ?? 5_000;
        const tip = opts?.tip ?? null;

        const jsonStr = typeof data !== "string" ? JSON.stringify(data, null, 2) : data;
        const strLen = jsonStr.length;

        if (strLen <= characterLimit) {
            return { data };
        }

        if (Array.isArray(data) && data.length > 0) {
            if (data[0] !== null && typeof data[0] === "object" && !Array.isArray(data[0])) {
                // List of objects
                const summary = DataArtifacts.summarizeTable(data as Record<string, unknown>[]);
                const resultData: Record<string, unknown> = {
                    _total_rows: data.length,
                    _columns: summary,
                };
                if (tip !== null) {
                    resultData._tip = tip;
                }
                const result: Record<string, unknown> = { data: resultData };

                // Inflation guard
                const minimizedSize = JSON.stringify(result, null, 2).length;
                if (minimizedSize > strLen) {
                    return { data };
                }
                return result;
            }

            // Basic list
            const summaryVal = DataArtifacts.summarizeValues(data);
            const resultData: Record<string, unknown> = {
                _total_items: data.length,
                _summary: summaryVal,
            };
            if (tip !== null) {
                resultData._tip = tip;
            }
            const result: Record<string, unknown> = { data: resultData };

            // Inflation guard
            const minimizedSize = JSON.stringify(result, null, 2).length;
            if (minimizedSize > strLen) {
                return { data };
            }
            return result;
        }

        if (data !== null && typeof data === "object" && !Array.isArray(data)) {
            return DataArtifacts.minimizeObject(data as Record<string, unknown>, {
                characterLimit,
                minimizedObjectStringLength,
                tip,
            });
        }

        if (Array.isArray(data)) {
            return { data };
        }

        if (typeof data === "string") {
            return TextArtifacts.minimize(data, { characterLimit, tip });
        }

        return { data };
    }

    /**
     * Generate a comprehensive summary of tabular data (list of objects).
     *
     * @param data - List of objects representing table rows.
     *
     * @returns List of column summaries, or the original data if the summary
     *     would be larger (inflation guard).
     */
    static summarizeTable(
        data: Record<string, unknown>[],
    ): Record<string, unknown>[] | Record<string, unknown>[] {
        if (data.length === 0) {
            return [];
        }

        const columnNames = uniqueColumns(data);
        const columns: Record<string, unknown>[] = [];

        for (const columnName of columnNames) {
            const values: unknown[] = [];
            for (const item of data) {
                if (item !== null && typeof item === "object" && columnName in item) {
                    values.push(item[columnName]);
                }
            }

            const columnSummary = DataArtifacts.summarizeValues(values);
            if (Array.isArray(columnSummary)) {
                columns.push({ name: columnName, values: columnSummary });
            } else {
                const entry = { ...columnSummary, name: columnName };
                columns.push(entry);
            }
        }

        // Overall inflation guard
        if (JSON.stringify(columns).length > JSON.stringify(data).length) {
            return data;
        }

        return columns;
    }

    /**
     * Generate a summary of a list of values (like a single column).
     *
     * @param values - List of values to summarize.
     *
     * @returns Object with column-like statistics, or the original list if
     *     the summary would be larger (inflation guard).
     */
    static summarizeValues(values: unknown[]): Record<string, unknown> | unknown[] {
        if (values.length === 0) {
            return { count: 0, types: [] };
        }

        const count = values.length;

        // Calculate unique count
        const uniqueValues: unknown[] = [];
        for (const v of values) {
            if (v !== null && typeof v === "object") {
                uniqueValues.push(stableStringify(v));
            } else {
                uniqueValues.push(v);
            }
        }
        const uniqueCount = new Set(uniqueValues).size;

        // Group values by type
        const typeGroups: Map<string, unknown[]> = new Map();
        for (const v of values) {
            const typeName = getTypeName(v);
            if (!typeGroups.has(typeName)) {
                typeGroups.set(typeName, []);
            }
            typeGroups.get(typeName)?.push(v);
        }

        // Sort by count descending
        const sortedEntries = [...typeGroups.entries()].sort((a, b) => b[1].length - a[1].length);

        const types: Record<string, unknown>[] = [];
        for (const [typeName, typeValues] of sortedEntries) {
            const typeCount = typeValues.length;
            const percentage = (typeCount / count) * 100;
            const typeEntry: Record<string, unknown> = {
                name: typeName,
                count: typeCount,
                percentage: Math.round(percentage * 10) / 10,
            };

            // Add sample value
            typeEntry.sample_value = typeValues[Math.floor(Math.random() * typeValues.length)];

            // Add type-specific statistics
            if (typeName === "string") {
                const lengths = (typeValues as string[]).map((s) => s.length);
                typeEntry.length_minimum = Math.min(...lengths);
                typeEntry.length_maximum = Math.max(...lengths);
                typeEntry.length_average = Math.round(mean(lengths) * 100) / 100;
                if (lengths.length > 1) {
                    typeEntry.length_stdev = Math.round(stdev(lengths) * 100) / 100;
                }
            } else if (typeName === "int" || typeName === "float") {
                const nums = typeValues as number[];
                typeEntry.minimum = Math.min(...nums);
                typeEntry.maximum = Math.max(...nums);
                typeEntry.average = Math.round(mean(nums) * 100) / 100;
                if (nums.length > 1) {
                    typeEntry.stdev = Math.round(stdev(nums) * 100) / 100;
                }
            } else if (typeName === "object") {
                const jsonLengths = (typeValues as object[]).map(
                    (obj) => JSON.stringify(obj).length,
                );
                typeEntry.json_length_minimum = Math.min(...jsonLengths);
                typeEntry.json_length_maximum = Math.max(...jsonLengths);
                typeEntry.json_length_average = Math.round(mean(jsonLengths) * 100) / 100;
                if (jsonLengths.length > 1) {
                    typeEntry.json_length_stdev = Math.round(stdev(jsonLengths) * 100) / 100;
                }
            } else if (typeName === "list") {
                const listLengths = (typeValues as unknown[][]).map((lst) => lst.length);
                typeEntry.length_minimum = Math.min(...listLengths);
                typeEntry.length_maximum = Math.max(...listLengths);
                typeEntry.length_average = Math.round(mean(listLengths) * 100) / 100;
                if (listLengths.length > 1) {
                    typeEntry.length_stdev = Math.round(stdev(listLengths) * 100) / 100;
                }
            }
            types.push(typeEntry);
        }

        const summary: Record<string, unknown> = {
            count,
            unique_count: uniqueCount,
            types,
        };

        // Inflation guard
        if (JSON.stringify(summary).length > JSON.stringify(values).length) {
            return values;
        }

        return summary;
    }

    /**
     * Minimize an object for display.
     *
     * If JSON-stringified length is <= characterLimit chars, return it in full.
     * If > characterLimit chars, show all keys but truncate string values and summarize lists.
     *
     * @param obj - The object to minimize.
     * @param opts.characterLimit - Character limit above which to minimize.
     * @param opts.minimizedObjectStringLength - Max length for string values.
     * @param opts.tip - Tip to include. Defaults to null (no tip); pass a string to include one.
     *
     * @returns Object with "data" key containing the minimized content.
     */
    private static minimizeObject(
        obj: Record<string, unknown>,
        opts?: {
            characterLimit?: number;
            minimizedObjectStringLength?: number;
            tip?: string | null;
        },
    ): Record<string, unknown> {
        const characterLimit = opts?.characterLimit ?? 50_000;
        const minimizedObjectStringLength = opts?.minimizedObjectStringLength ?? 5_000;
        const tip = opts?.tip ?? null;

        const jsonStr = JSON.stringify(obj, null, 2);
        if (jsonStr.length <= characterLimit) {
            return { data: obj };
        }

        const minimized = DataArtifacts.minimizeObjectValues(obj, {
            minimizedObjectStringLength,
        }) as Record<string, unknown>;

        if (tip !== null) {
            minimized._tip = tip;
        }

        const result: Record<string, unknown> = { data: minimized };

        // Inflation guard
        const minimizedSize = JSON.stringify(result, null, 2).length;
        const originalSize = jsonStr.length;
        if (minimizedSize > originalSize) {
            return { data: obj };
        }

        return result;
    }

    /**
     * Evaluate a JSONPath-like expression for field access only.
     *
     * Supports:
     * - "field" - top-level field
     * - "field.nested" - nested field access
     *
     * Does NOT support array indexing - use rows/columns parameters instead.
     *
     * @param data - The data to query.
     * @param path - The dot-separated field path.
     *
     * @returns The extracted value.
     *
     * @throws TypeError if trying to access field on non-object.
     * @throws Error if field doesn't exist.
     */
    private static evaluateJsonPath(data: unknown, path: string): unknown {
        if (!path) {
            return data;
        }

        const parts = path.split(".");
        let current = data;

        for (const part of parts) {
            if (current === null || typeof current !== "object" || Array.isArray(current)) {
                const typeName =
                    current === null ? "null" : Array.isArray(current) ? "list" : typeof current;
                throw new TypeError(
                    `Cannot access field '${part}' on ${typeName}. Use rows/columns parameters to filter list data.`,
                );
            }
            const obj = current as Record<string, unknown>;
            if (!(part in obj)) {
                const available =
                    Object.keys(obj).length > 0 ? Object.keys(obj).join(", ") : "(empty)";
                throw new Error(`Field '${part}' not found. Available fields: ${available}`);
            }
            current = obj[part];
        }

        return current;
    }

    /**
     * Parse the row selection parameter into a list of row indices.
     *
     * @param rows - Can be a single row index (number), list of indices, range string ("0-10"), or "all".
     * @param totalRows - Total number of rows in the dataset.
     *
     * @returns List of row indices to include.
     */
    private static parseRowSelection(
        rows: number | number[] | string,
        totalRows: number,
    ): number[] {
        if (typeof rows === "number") {
            let row = rows;
            if (row < 0) {
                row = totalRows + row;
            }
            if (row < 0 || row >= totalRows) {
                throw new Error(
                    `Row index ${row} is out of range for dataset with ${totalRows} rows`,
                );
            }
            return [row];
        }

        if (Array.isArray(rows)) {
            const validatedRows: number[] = [];
            for (let row of rows) {
                if (row < 0) {
                    row = totalRows + row;
                }
                if (row < 0 || row >= totalRows) {
                    throw new Error(
                        `Row index ${row} is out of range for dataset with ${totalRows} rows`,
                    );
                }
                validatedRows.push(row);
            }
            return validatedRows;
        }

        if (typeof rows === "string") {
            if (rows === "all") {
                return Array.from({ length: totalRows }, (_, i) => i);
            }
            if (rows.includes("-")) {
                const parts = rows.split("-", 2);
                if (parts.length !== 2) {
                    throw new Error(
                        `Invalid range format: ${rows}. Expected format: 'start-end' (e.g., '0-10')`,
                    );
                }

                const startStr = parts[0];
                const endStr = parts[1];

                let start = startStr ? Number.parseInt(startStr, 10) : 0;
                let end = endStr ? Number.parseInt(endStr, 10) : totalRows;

                if (Number.isNaN(start) || Number.isNaN(end)) {
                    throw new Error(
                        `Invalid range format: ${rows}. Expected integers in 'start-end' format.`,
                    );
                }

                if (start < 0) start = totalRows + start;
                if (end < 0) end = totalRows + end;

                if (start < 0 || start >= totalRows) {
                    throw new Error(`Start index ${start} is out of range`);
                }
                if (end < 0 || end > totalRows) {
                    throw new Error(`End index ${end} is out of range`);
                }
                if (start > end) {
                    throw new Error(`Start index ${start} is greater than end index ${end}`);
                }

                return Array.from({ length: end - start }, (_, i) => start + i);
            }

            throw new Error(
                `Invalid row selection: ${rows}. Must be an integer, list of integers, 'all', or a range like '0-10'`,
            );
        }

        throw new Error(`Invalid row selection type: ${typeof rows}`);
    }

    /**
     * Parse the column selection parameter into a list of column names.
     *
     * @param columns - Can be a single column name (string), list of column names, or "all".
     * @param availableColumns - List of all available column names in the dataset.
     *
     * @returns List of column names to include.
     */
    private static parseColumnSelection(
        columns: string | string[],
        availableColumns: string[],
    ): string[] {
        if (typeof columns === "string") {
            if (columns === "all") {
                return availableColumns;
            }
            if (!availableColumns.includes(columns)) {
                throw new Error(
                    `Column '${columns}' not found. Available columns: ${availableColumns.join(", ")}`,
                );
            }
            return [columns];
        }

        if (Array.isArray(columns)) {
            for (const col of columns) {
                if (!availableColumns.includes(col)) {
                    throw new Error(
                        `Column '${col}' not found. Available columns: ${availableColumns.join(", ")}`,
                    );
                }
            }
            return columns;
        }

        throw new Error(`Invalid column selection type: ${typeof columns}`);
    }

    /**
     * Filter data by row indices and column names.
     *
     * @param data - The full dataset.
     * @param rowIndices - List of row indices to include.
     * @param columnNames - List of column names to include.
     *
     * @returns Filtered data.
     */
    private static filterDataByRowsAndColumns(
        data: Record<string, unknown>[],
        rowIndices: number[],
        columnNames: string[],
    ): Record<string, unknown>[] {
        const filteredData: Record<string, unknown>[] = [];

        for (const rowIdx of rowIndices) {
            if (rowIdx >= data.length) {
                continue;
            }

            const row = data[rowIdx];
            const filteredRow: Record<string, unknown> = {};

            for (const col of columnNames) {
                if (col in row) {
                    filteredRow[col] = row[col];
                }
            }

            filteredData.push(filteredRow);
        }

        return filteredData;
    }

    /** Recursively minimize values in an object. */
    private static minimizeObjectValues(
        value: unknown,
        opts?: {
            minimizedObjectStringLength?: number;
            depth?: number;
            path?: string;
        },
    ): unknown {
        const minimizedObjectStringLength = opts?.minimizedObjectStringLength ?? 5_000;
        const depth = opts?.depth ?? 0;
        const path = opts?.path ?? "";

        if (depth > 10) {
            return "...";
        }

        if (typeof value === "string") {
            if (value.length > minimizedObjectStringLength) {
                const remaining = value.length - minimizedObjectStringLength;
                return `${value.slice(0, minimizedObjectStringLength)}... [${formatNumber(remaining)} more chars]`;
            }
            return value;
        }

        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            const obj = value as Record<string, unknown>;
            const result: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(obj)) {
                result[k] = DataArtifacts.minimizeObjectValues(v, {
                    minimizedObjectStringLength,
                    depth: depth + 1,
                    path: path ? `${path}.${k}` : k,
                });
            }
            return result;
        }

        if (Array.isArray(value)) {
            if (value.length === 0) {
                return value;
            }

            if (value[0] !== null && typeof value[0] === "object" && !Array.isArray(value[0])) {
                const tableResult = DataArtifacts.summarizeTable(
                    value as Record<string, unknown>[],
                );
                const summaryDict: Record<string, unknown> = {
                    _total_rows: value.length,
                    _columns: tableResult,
                };
                if (path) {
                    summaryDict._json_path = path;
                }
                if (JSON.stringify(summaryDict).length > JSON.stringify(value).length) {
                    return value;
                }
                return summaryDict;
            }

            const valResult = DataArtifacts.summarizeValues(value);
            const summaryDict: Record<string, unknown> = {
                _total_items: value.length,
                _summary: valResult,
            };
            if (path) {
                summaryDict._json_path = path;
            }
            if (JSON.stringify(summaryDict).length > JSON.stringify(value).length) {
                return value;
            }
            return summaryDict;
        }

        return value;
    }
}

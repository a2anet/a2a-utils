// SPDX-FileCopyrightText: 2025-present A2A Net <hello@a2anet.com>
//
// SPDX-License-Identifier: Apache-2.0

/**
 * Text artifact viewing and minimization.
 */

/** Format a number with comma separators (locale-independent, matching Python's `f"{n:,}"`). */
function formatNumber(n: number): string {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Text artifact operations: viewing and minimization. */
export class TextArtifacts {
    /**
     * View text content with optional line or character range selection.
     *
     * @param text - The text to view.
     * @param opts.lineStart - Starting line number (1-based, inclusive). null = start.
     * @param opts.lineEnd - Ending line number (1-based, inclusive). null = end.
     * @param opts.characterStart - Starting character index (0-based, inclusive). null = start.
     * @param opts.characterEnd - Ending character index (0-based, exclusive). null = end.
     * @param opts.characterLimit - Maximum output size in characters.
     *
     * @returns Filtered text string.
     *
     * @throws Error if both line and character selection are provided,
     *     or if parameters are invalid.
     */
    static view(
        text: string,
        opts?: {
            lineStart?: number | null;
            lineEnd?: number | null;
            characterStart?: number | null;
            characterEnd?: number | null;
            characterLimit?: number;
        },
    ): string {
        const lineStart = opts?.lineStart ?? null;
        const lineEnd = opts?.lineEnd ?? null;
        const characterStart = opts?.characterStart ?? null;
        const characterEnd = opts?.characterEnd ?? null;
        const characterLimit = opts?.characterLimit ?? 50_000;

        const hasLine = lineStart !== null || lineEnd !== null;
        const hasChar = characterStart !== null || characterEnd !== null;

        if (hasLine && hasChar) {
            throw new Error("Cannot use both line and character selection");
        }

        let resultText: string;

        if (hasChar) {
            const start = characterStart ?? 0;
            const end = characterEnd ?? text.length;
            resultText = text.slice(start, end);
        } else if (hasLine) {
            const lines = text.split("\n");
            const totalLines = lines.length;
            const [startIdx, endIdx] = TextArtifacts.parseLineRange(
                lineStart,
                lineEnd,
                totalLines,
            );
            const selectedLines = lines.slice(startIdx, endIdx);
            resultText = selectedLines.join("\n");
        } else {
            resultText = text;
        }

        if (resultText.length > characterLimit) {
            throw new Error(
                `Selected text (${formatNumber(resultText.length)} characters) exceeds the maximum output size of ${formatNumber(characterLimit)} characters. Try selecting a smaller range.`,
            );
        }

        return resultText;
    }

    /**
     * Minimize text content for display.
     *
     * If text is <= characterLimit chars, return it in full inside "text" key.
     * If text is > characterLimit chars, show first half and last half with metadata.
     *
     * @param text - The text content to minimize.
     * @param opts.characterLimit - Character limit above which to minimize.
     * @param opts.tip - Tip to include. Defaults to null (no tip); pass a string to include one.
     *
     * @returns Object with "text" key containing readable content and metadata fields.
     */
    static minimize(
        text: string,
        opts?: {
            characterLimit?: number;
            tip?: string | null;
        },
    ): Record<string, unknown> {
        const characterLimit = opts?.characterLimit ?? 50_000;
        const tip = opts?.tip ?? null;

        if (text.length <= characterLimit) {
            return { text };
        }

        const half = Math.floor(characterLimit / 2);
        const lines = text.split("\n");
        const lineCount = lines.length;

        // Find which line the half char falls on for the start
        let charCount = 0;
        let startEndLine = 1;
        for (let i = 0; i < lines.length; i++) {
            charCount += lines[i].length + 1; // +1 for newline
            if (charCount >= half) {
                startEndLine = i + 1;
                break;
            }
        }

        // Find which line the end section starts on
        charCount = 0;
        let endStartLine = lineCount;
        for (let i = lines.length - 1; i >= 0; i--) {
            charCount += lines[i].length + 1;
            if (charCount >= half) {
                endStartLine = i + 1;
                break;
            }
        }

        const omittedChars = text.length - 2 * half;

        const result: Record<string, unknown> = {
            text: `${text.slice(0, half)}\n\n[... ${formatNumber(omittedChars)} characters omitted ...]\n\n${text.slice(-half)}`,
            _total_lines: lineCount,
            _total_characters: text.length,
            _start_line_range: `1-${startEndLine}`,
            _end_line_range: `${endStartLine}-${lineCount}`,
            _start_character_range: `0-${half}`,
            _end_character_range: `${text.length - half}-${text.length}`,
        };

        if (tip !== null) {
            result._tip = tip;
        }

        return result;
    }

    /**
     * Parse line range parameters.
     *
     * @param lineStart - Starting line number (1-based, inclusive). null means 1.
     * @param lineEnd - Ending line number (1-based, inclusive). null means totalLines.
     * @param totalLines - Total number of lines.
     *
     * @returns Tuple of [startIndex, endIndex] as 0-based indices.
     *
     * @throws Error if line numbers are invalid.
     */
    private static parseLineRange(
        lineStart: number | null,
        lineEnd: number | null,
        totalLines: number,
    ): [number, number] {
        let start = lineStart ?? 1;
        let end = lineEnd ?? totalLines;

        // Handle negative line numbers (count from end)
        if (start < 0) {
            start = totalLines + start + 1;
        }
        if (end < 0) {
            end = totalLines + end + 1;
        }

        // Validate range
        if (start < 1) {
            throw new Error(`line_start must be >= 1 (got ${start})`);
        }
        if (end > totalLines) {
            throw new Error(`line_end (${end}) exceeds total lines (${totalLines})`);
        }
        if (start > end) {
            throw new Error(`line_start (${start}) must be <= line_end (${end})`);
        }

        // Convert to 0-based indices
        return [start - 1, end];
    }
}

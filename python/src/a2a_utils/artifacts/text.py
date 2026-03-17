"""Text artifact viewing and minimization."""

from typing import Any


class TextArtifacts:
    """Text artifact operations: viewing and minimization."""

    @staticmethod
    def view(
        text: str,
        *,
        line_start: int | None = None,
        line_end: int | None = None,
        character_start: int | None = None,
        character_end: int | None = None,
        character_limit: int = 50_000,
    ) -> str:
        """View text content with optional line or character range selection.

        Args:
            text: The text to view.
            line_start: Starting line number (1-based, inclusive). None = start.
            line_end: Ending line number (1-based, inclusive). None = end.
            character_start: Starting character index (0-based, inclusive). None = start.
            character_end: Ending character index (0-based, exclusive). None = end.
            character_limit: Maximum output size in characters.

        Returns:
            Filtered text string.

        Raises:
            ValueError: If both line and character selection are provided,
                or if parameters are invalid.
        """
        has_line = line_start is not None or line_end is not None
        has_char = character_start is not None or character_end is not None

        if has_line and has_char:
            raise ValueError("Cannot use both line and character selection")

        if has_char:
            start = character_start if character_start is not None else 0
            end = character_end if character_end is not None else len(text)
            result_text = text[start:end]
        elif has_line:
            lines = text.split("\n")
            total_lines = len(lines)
            start_idx, end_idx = TextArtifacts._parse_line_range(line_start, line_end, total_lines)
            selected_lines = lines[start_idx:end_idx]
            result_text = "\n".join(selected_lines)
        else:
            result_text = text

        if len(result_text) > character_limit:
            raise ValueError(
                f"Selected text ({len(result_text):,} characters) exceeds the maximum "
                f"output size of {character_limit:,} characters. "
                f"Try selecting a smaller range."
            )

        return result_text

    @staticmethod
    def minimize(
        text: str,
        *,
        character_limit: int = 50_000,
        tip: str | None = None,
    ) -> dict[str, Any]:
        """Minimize text content for display.

        If text is <= character_limit chars, return it in full inside "text" key.
        If text is > character_limit chars, show first half and last half with metadata.

        Args:
            text: The text content to minimize.
            character_limit: Character limit above which to minimize.
            tip: Tip to include. Defaults to None (no tip); pass a string to include one.

        Returns:
            Dict with "text" key containing readable content and metadata fields.
        """
        if len(text) <= character_limit:
            return {"text": text}

        half = character_limit // 2
        lines = text.split("\n")
        line_count = len(lines)

        # Find which line the half char falls on for the start
        char_count = 0
        start_end_line = 1
        for i, line in enumerate(lines):
            char_count += len(line) + 1  # +1 for newline
            if char_count >= half:
                start_end_line = i + 1
                break

        # Find which line the end section starts on
        char_count = 0
        end_start_line = line_count
        for i in range(len(lines) - 1, -1, -1):
            char_count += len(lines[i]) + 1
            if char_count >= half:
                end_start_line = i + 1
                break

        omitted_chars = len(text) - (2 * half)

        result: dict[str, Any] = {
            "text": f"{text[:half]}\n\n[... {omitted_chars:,} characters omitted ...]\n\n{text[-half:]}",
            "_total_lines": line_count,
            "_total_characters": len(text),
            "_start_line_range": f"1-{start_end_line}",
            "_end_line_range": f"{end_start_line}-{line_count}",
            "_start_character_range": f"0-{half}",
            "_end_character_range": f"{len(text) - half}-{len(text)}",
        }

        if tip is not None:
            result["_tip"] = tip

        return result

    @staticmethod
    def _parse_line_range(
        line_start: int | None, line_end: int | None, total_lines: int
    ) -> tuple[int, int]:
        """Parse line range parameters.

        Args:
            line_start: Starting line number (1-based, inclusive). None means 1.
            line_end: Ending line number (1-based, inclusive). None means total_lines.
            total_lines: Total number of lines

        Returns:
            Tuple of (start_index, end_index) as 0-based indices

        Raises:
            ValueError: If line numbers are invalid
        """
        # Default values
        start = line_start if line_start is not None else 1
        end = line_end if line_end is not None else total_lines

        # Handle negative line numbers (count from end)
        if start < 0:
            start = total_lines + start + 1
        if end < 0:
            end = total_lines + end + 1

        # Validate range
        if start < 1:
            raise ValueError(f"line_start must be >= 1 (got {start})")
        if end > total_lines:
            raise ValueError(f"line_end ({end}) exceeds total lines ({total_lines})")
        if start > end:
            raise ValueError(f"line_start ({start}) must be <= line_end ({end})")

        # Convert to 0-based indices
        return start - 1, end

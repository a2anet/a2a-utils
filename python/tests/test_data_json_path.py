"""Tests for JSON path and line range parsing."""

import pytest

from a2a_utils.artifacts.data import DataArtifacts
from a2a_utils.artifacts.text import TextArtifacts


class TestEvaluateJsonPath:
    def test_empty_path(self) -> None:
        data = {"a": 1}
        assert DataArtifacts._evaluate_json_path(data, "") == data

    def test_single_field(self) -> None:
        assert DataArtifacts._evaluate_json_path({"a": 1, "b": 2}, "a") == 1

    def test_nested_field(self) -> None:
        data = {"a": {"b": {"c": 42}}}
        assert DataArtifacts._evaluate_json_path(data, "a.b.c") == 42

    def test_field_not_found(self) -> None:
        with pytest.raises(KeyError, match="not found"):
            DataArtifacts._evaluate_json_path({"a": 1}, "z")

    def test_access_on_non_dict(self) -> None:
        with pytest.raises(TypeError, match="Cannot access field"):
            DataArtifacts._evaluate_json_path({"a": [1, 2]}, "a.b")

    def test_returns_list(self) -> None:
        data = {"items": [1, 2, 3]}
        assert DataArtifacts._evaluate_json_path(data, "items") == [1, 2, 3]


class TestParseLineRange:
    def test_defaults(self) -> None:
        assert TextArtifacts._parse_line_range(None, None, 10) == (0, 10)

    def test_specific_range(self) -> None:
        assert TextArtifacts._parse_line_range(1, 5, 10) == (0, 5)

    def test_single_line(self) -> None:
        assert TextArtifacts._parse_line_range(3, 3, 10) == (2, 3)

    def test_negative_start(self) -> None:
        # -1 means last line -> line 10
        assert TextArtifacts._parse_line_range(-1, None, 10) == (9, 10)

    def test_negative_end(self) -> None:
        assert TextArtifacts._parse_line_range(1, -1, 10) == (0, 10)

    def test_start_less_than_1(self) -> None:
        with pytest.raises(ValueError, match="must be >= 1"):
            TextArtifacts._parse_line_range(0, 5, 10)

    def test_end_exceeds_total(self) -> None:
        with pytest.raises(ValueError, match="exceeds total lines"):
            TextArtifacts._parse_line_range(1, 20, 10)

    def test_start_greater_than_end(self) -> None:
        with pytest.raises(ValueError, match="must be <="):
            TextArtifacts._parse_line_range(5, 3, 10)

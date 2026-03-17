"""Tests for data selection utilities."""

import pytest

from a2a_utils.artifacts.data import DataArtifacts


class TestParseRowSelection:
    def test_single_int(self) -> None:
        assert DataArtifacts._parse_row_selection(0, 5) == [0]
        assert DataArtifacts._parse_row_selection(4, 5) == [4]

    def test_negative_index(self) -> None:
        assert DataArtifacts._parse_row_selection(-1, 5) == [4]
        assert DataArtifacts._parse_row_selection(-3, 5) == [2]

    def test_out_of_range(self) -> None:
        with pytest.raises(ValueError, match="out of range"):
            DataArtifacts._parse_row_selection(5, 5)

    def test_negative_out_of_range(self) -> None:
        with pytest.raises(ValueError, match="out of range"):
            DataArtifacts._parse_row_selection(-6, 5)

    def test_list_of_ints(self) -> None:
        assert DataArtifacts._parse_row_selection([0, 2, 4], 5) == [0, 2, 4]

    def test_list_with_negative(self) -> None:
        assert DataArtifacts._parse_row_selection([0, -1], 5) == [0, 4]

    def test_list_out_of_range(self) -> None:
        with pytest.raises(ValueError, match="out of range"):
            DataArtifacts._parse_row_selection([0, 10], 5)

    def test_all_string(self) -> None:
        assert DataArtifacts._parse_row_selection("all", 3) == [0, 1, 2]

    def test_range_string(self) -> None:
        assert DataArtifacts._parse_row_selection("0-3", 5) == [0, 1, 2]

    def test_range_string_full(self) -> None:
        assert DataArtifacts._parse_row_selection("0-5", 5) == [0, 1, 2, 3, 4]

    def test_range_invalid_start(self) -> None:
        with pytest.raises(ValueError, match="out of range"):
            DataArtifacts._parse_row_selection("10-20", 5)

    def test_range_start_greater_than_end(self) -> None:
        with pytest.raises(ValueError, match="greater than"):
            DataArtifacts._parse_row_selection("3-1", 5)

    def test_invalid_string(self) -> None:
        with pytest.raises(ValueError, match="Invalid row selection"):
            DataArtifacts._parse_row_selection("foo", 5)

    def test_invalid_type(self) -> None:
        with pytest.raises(ValueError, match="Invalid row selection type"):
            DataArtifacts._parse_row_selection(3.14, 5)  # type: ignore[arg-type]


class TestParseColumnSelection:
    def test_all_string(self) -> None:
        cols = ["a", "b", "c"]
        assert DataArtifacts._parse_column_selection("all", cols) == cols

    def test_single_column(self) -> None:
        assert DataArtifacts._parse_column_selection("b", ["a", "b", "c"]) == ["b"]

    def test_column_not_found(self) -> None:
        with pytest.raises(ValueError, match="not found"):
            DataArtifacts._parse_column_selection("z", ["a", "b"])

    def test_list_of_columns(self) -> None:
        assert DataArtifacts._parse_column_selection(["a", "c"], ["a", "b", "c"]) == ["a", "c"]

    def test_list_column_not_found(self) -> None:
        with pytest.raises(ValueError, match="not found"):
            DataArtifacts._parse_column_selection(["a", "z"], ["a", "b"])

    def test_invalid_type(self) -> None:
        with pytest.raises(ValueError, match="Invalid column selection type"):
            DataArtifacts._parse_column_selection(123, ["a"])  # type: ignore[arg-type]


class TestFilterDataByRowsAndColumns:
    def test_basic_filter(self) -> None:
        data = [
            {"a": 1, "b": 2, "c": 3},
            {"a": 4, "b": 5, "c": 6},
            {"a": 7, "b": 8, "c": 9},
        ]
        result = DataArtifacts._filter_data_by_rows_and_columns(data, [0, 2], ["a", "c"])
        assert result == [{"a": 1, "c": 3}, {"a": 7, "c": 9}]

    def test_out_of_bounds_row_skipped(self) -> None:
        data = [{"a": 1}]
        result = DataArtifacts._filter_data_by_rows_and_columns(data, [0, 5], ["a"])
        assert result == [{"a": 1}]

    def test_missing_column_skipped(self) -> None:
        data = [{"a": 1, "b": 2}]
        result = DataArtifacts._filter_data_by_rows_and_columns(data, [0], ["a", "z"])
        assert result == [{"a": 1}]

    def test_empty_data(self) -> None:
        result = DataArtifacts._filter_data_by_rows_and_columns([], [0], ["a"])
        assert result == []


class TestDataArtifactsView:
    def test_plain_data_passthrough(self) -> None:
        data = {"key": "value"}
        result = DataArtifacts.view(data)
        assert result == {"key": "value"}

    def test_list_with_rows_and_columns(self) -> None:
        data = [
            {"a": 1, "b": 2, "c": 3},
            {"a": 4, "b": 5, "c": 6},
            {"a": 7, "b": 8, "c": 9},
        ]
        result = DataArtifacts.view(data, rows=[0, 2], columns=["a", "c"])
        assert result == [{"a": 1, "c": 3}, {"a": 7, "c": 9}]

    def test_json_path_then_filter(self) -> None:
        data = {
            "items": [
                {"name": "Alice", "age": 30},
                {"name": "Bob", "age": 25},
            ]
        }
        result = DataArtifacts.view(data, json_path="items", rows=0, columns="name")
        assert result == [{"name": "Alice"}]

    def test_character_limit_exceeded(self) -> None:
        data = [{"a": "x" * 10_000} for _ in range(10)]
        with pytest.raises(ValueError, match="exceeds"):
            DataArtifacts.view(data, character_limit=100)

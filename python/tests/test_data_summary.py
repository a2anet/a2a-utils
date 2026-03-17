"""Tests for data summary utilities."""

import random

from a2a_utils.artifacts.data import DataArtifacts


class TestSummarizeValues:
    def test_empty_list(self) -> None:
        result = DataArtifacts.summarize_values([])
        assert result == {"count": 0, "types": []}

    def test_integers(self) -> None:
        random.seed(42)
        values = list(range(100))
        result = DataArtifacts.summarize_values(values)
        assert isinstance(result, dict)
        assert result["count"] == 100
        assert result["unique_count"] == 100
        assert len(result["types"]) == 1
        assert result["types"][0]["name"] == "int"
        assert result["types"][0]["minimum"] == 0
        assert result["types"][0]["maximum"] == 99

    def test_strings(self) -> None:
        random.seed(42)
        values = [f"employee_{i:04d}@company.com" for i in range(100)]
        result = DataArtifacts.summarize_values(values)
        assert isinstance(result, dict)
        assert result["count"] == 100
        assert result["types"][0]["name"] == "string"
        assert result["types"][0]["length_minimum"] == len("employee_0000@company.com")
        assert result["types"][0]["length_maximum"] == len("employee_0000@company.com")

    def test_mixed_types(self) -> None:
        random.seed(42)
        values = list(range(50)) + [f"str_{i}" for i in range(30)] + [None] * 20
        result = DataArtifacts.summarize_values(values)
        assert isinstance(result, dict)
        assert result["count"] == 100
        type_names = {t["name"] for t in result["types"]}
        assert type_names == {"int", "string", "null"}

    def test_booleans_not_counted_as_int(self) -> None:
        random.seed(42)
        values = [True, False] * 50 + list(range(50))
        result = DataArtifacts.summarize_values(values)
        assert isinstance(result, dict)
        type_names = {t["name"] for t in result["types"]}
        assert "bool" in type_names
        assert "int" in type_names

    def test_objects(self) -> None:
        random.seed(42)
        values = [{"key": f"value_{i}", "score": i * 1.5} for i in range(100)]
        result = DataArtifacts.summarize_values(values)
        assert isinstance(result, dict)
        assert result["types"][0]["name"] == "object"
        assert "json_length_minimum" in result["types"][0]

    def test_lists(self) -> None:
        random.seed(42)
        values = [list(range(i, i + 5)) for i in range(100)]
        result = DataArtifacts.summarize_values(values)
        assert isinstance(result, dict)
        assert result["types"][0]["name"] == "list"
        assert result["types"][0]["length_minimum"] == 5
        assert result["types"][0]["length_maximum"] == 5

    def test_unique_count_with_dicts(self) -> None:
        random.seed(42)
        # 50 unique dicts, each duplicated once = 100 total, 50 unique
        values = [{"a": i} for i in range(50)] * 2
        result = DataArtifacts.summarize_values(values)
        assert isinstance(result, dict)
        assert result["unique_count"] == 50


class TestSummarizeValuesInflationGuard:
    def test_small_int_list_returns_original(self) -> None:
        values = [1, 2, 3]
        result = DataArtifacts.summarize_values(values)
        assert result == [1, 2, 3]

    def test_small_string_list_returns_original(self) -> None:
        values = ["a", "b"]
        result = DataArtifacts.summarize_values(values)
        assert result == ["a", "b"]

    def test_small_mixed_list_returns_original(self) -> None:
        values = [1, "hello", None]
        result = DataArtifacts.summarize_values(values)
        assert result == [1, "hello", None]

    def test_large_list_returns_summary(self) -> None:
        random.seed(42)
        values = list(range(200))
        result = DataArtifacts.summarize_values(values)
        assert isinstance(result, dict)
        assert "count" in result


class TestSummarizeTable:
    def test_empty_data(self) -> None:
        assert DataArtifacts.summarize_table([]) == []

    def test_basic_table(self) -> None:
        random.seed(42)
        data = [{"name": f"Employee {i}", "salary": 50000 + i * 500} for i in range(50)]
        result = DataArtifacts.summarize_table(data)
        assert isinstance(result, list)
        assert len(result) == 2

        col_names = {col["name"] for col in result}
        assert col_names == {"name", "salary"}

    def test_sparse_data(self) -> None:
        random.seed(42)
        data = []
        for i in range(50):
            row: dict[str, object] = {"a": i * 100}
            if i % 2 == 0:
                row["b"] = f"even_{i}"
            if i % 3 == 0:
                row["c"] = i * 0.5
            data.append(row)
        result = DataArtifacts.summarize_table(data)
        assert isinstance(result, list)
        col_names = [col["name"] for col in result]
        assert "a" in col_names
        assert "b" in col_names
        assert "c" in col_names

    def test_column_counts(self) -> None:
        random.seed(42)
        data = [{"x": i * 10} for i in range(100)]
        result = DataArtifacts.summarize_table(data)
        assert isinstance(result, list)
        assert result[0]["count"] == 100


class TestSummarizeTableInflationGuard:
    def test_small_table_returns_original(self) -> None:
        data = [
            {"name": "Alice", "age": 30},
            {"name": "Bob", "age": 25},
        ]
        result = DataArtifacts.summarize_table(data)
        assert result == data

    def test_large_table_returns_summary(self) -> None:
        random.seed(42)
        data = [{"name": f"Employee {i}", "salary": 50000 + i * 500} for i in range(50)]
        result = DataArtifacts.summarize_table(data)
        assert isinstance(result, list)
        assert all(isinstance(col, dict) for col in result)
        # Should be column summaries, not original rows
        col_names = {col["name"] for col in result}
        assert col_names == {"name", "salary"}

    def test_mixed_columns_raw_and_summarized(self) -> None:
        """Table where short-valued columns stay raw, long-valued columns get summarized."""
        random.seed(42)
        data = [
            {
                "id": i,
                "bio": f"This is a biography for person {i} with lots of detail about their career and achievements.",
            }
            for i in range(30)
        ]
        result = DataArtifacts.summarize_table(data)
        assert isinstance(result, list)
        # Find the id and bio columns
        id_col = next(col for col in result if col["name"] == "id")
        bio_col = next(col for col in result if col["name"] == "bio")
        # id column may have raw values (small ints), bio column should be summarized
        if "values" in id_col:
            # Per-column inflation guard returned raw values
            assert id_col["values"] == list(range(30))
        else:
            # Summary was smaller
            assert "count" in id_col
        # Bio should be summarized (long strings)
        assert "count" in bio_col

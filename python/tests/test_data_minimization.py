"""Tests for artifact minimization (TextArtifacts and DataArtifacts)."""

from a2a_utils.artifacts.data import DataArtifacts
from a2a_utils.artifacts.text import TextArtifacts


class TestMinimizeText:
    def test_short_text(self) -> None:
        result = TextArtifacts.minimize("Hello")
        assert result == {"text": "Hello"}

    def test_long_text_truncated(self) -> None:
        text = "x" * 51_000
        result = TextArtifacts.minimize(text)
        assert isinstance(result["text"], str)
        assert "characters omitted" in result["text"]
        assert "_total_lines" in result
        assert "_total_characters" in result
        assert result["_total_characters"] == 51_000
        assert "_start_line_range" in result
        assert "_end_line_range" in result
        assert result["_start_character_range"] == "0-25000"
        assert result["_end_character_range"] == "26000-51000"

    def test_default_no_tip(self) -> None:
        text = "x" * 51_000
        result = TextArtifacts.minimize(text)
        assert "_tip" not in result

    def test_custom_tip(self) -> None:
        text = "x" * 51_000
        result = TextArtifacts.minimize(text, tip="Custom tip.")
        assert result["_tip"] == "Custom tip."

    def test_empty_tip_omitted(self) -> None:
        text = "x" * 51_000
        result = TextArtifacts.minimize(text, tip=None)
        assert "_tip" not in result

    def test_custom_character_limit(self) -> None:
        text = "x" * 200
        result_default = TextArtifacts.minimize(text)
        assert result_default == {"text": text}

        result_custom = TextArtifacts.minimize(text, character_limit=100)
        assert isinstance(result_custom["text"], str)
        assert "characters omitted" in result_custom["text"]


class TestMinimizeObject:
    def test_small_object(self) -> None:
        obj = {"key": "value"}
        result = DataArtifacts._minimize_object(obj)
        assert result == {"data": {"key": "value"}}

    def test_large_object_truncates_strings(self) -> None:
        obj = {"key": "x" * 20_000, "key2": "y" * 20_000, "key3": "z" * 20_000}
        result = DataArtifacts._minimize_object(obj)
        assert "_tip" not in result["data"]
        assert "more chars" in result["data"]["key"]

    def test_custom_tip(self) -> None:
        obj = {"key": "x" * 20_000, "key2": "y" * 20_000, "key3": "z" * 20_000}
        result = DataArtifacts._minimize_object(obj, tip="Custom tip here")
        assert result["data"]["_tip"] == "Custom tip here"

    def test_empty_tip_omitted(self) -> None:
        obj = {"key": "x" * 20_000, "key2": "y" * 20_000, "key3": "z" * 20_000}
        result = DataArtifacts._minimize_object(obj, tip=None)
        assert "_tip" not in result["data"]

    def test_custom_character_limit(self) -> None:
        obj = {"key": "x" * 1000}
        result = DataArtifacts._minimize_object(
            obj, character_limit=50, minimized_object_string_length=50
        )
        assert "_tip" not in result["data"]

    def test_inflation_guard(self) -> None:
        obj = {"key": "short"}
        result = DataArtifacts._minimize_object(obj, character_limit=5)
        # Minimized form with _tip would be larger, so original is returned
        assert result == {"data": {"key": "short"}}


class TestMinimizeData:
    def test_small_data_passthrough(self) -> None:
        result = DataArtifacts.minimize({"key": "val"})
        assert result == {"data": {"key": "val"}}

    def test_string_data(self) -> None:
        text = "x" * 51_000
        result = DataArtifacts.minimize(text)
        assert "text" in result

    def test_list_of_objects(self) -> None:
        data = [{"a": "x" * 500} for _ in range(200)]
        result = DataArtifacts.minimize(data)
        assert "_total_rows" in result["data"]

    def test_list_of_objects_has_columns(self) -> None:
        data = [{"a": "x" * 500, "b": f"value-{i}"} for i in range(200)]
        result = DataArtifacts.minimize(data)
        assert "_total_rows" in result["data"]
        assert "_columns" in result["data"]

    def test_list_of_objects_no_default_tip(self) -> None:
        data = [{"a": "x" * 500} for _ in range(200)]
        result = DataArtifacts.minimize(data)
        assert "_tip" not in result["data"]

    def test_list_of_objects_custom_tip(self) -> None:
        data = [{"a": "x" * 500} for _ in range(200)]
        result = DataArtifacts.minimize(data, tip="Custom table tip")
        assert result["data"]["_tip"] == "Custom table tip"

    def test_list_of_objects_no_tip(self) -> None:
        data = [{"a": "x" * 500} for _ in range(200)]
        result = DataArtifacts.minimize(data, tip=None)
        assert "_tip" not in result["data"]

    def test_list_of_objects_inflation_guard(self) -> None:
        data = [{"a": 1}, {"a": 2}]
        result = DataArtifacts.minimize(data)
        # Summary would be larger than original, so original is returned
        assert result == {"data": data}

    def test_empty_list(self) -> None:
        result = DataArtifacts.minimize([])
        assert result == {"data": []}

    def test_primitive(self) -> None:
        result = DataArtifacts.minimize(42)
        assert result == {"data": 42}

    def test_large_list_no_default_tip(self) -> None:
        data = [{"a": "x" * 500} for _ in range(200)]
        result = DataArtifacts.minimize(data)
        assert "_tip" not in result["data"]


class TestMinimizeObjectValuesInflationGuard:
    def test_small_nested_list_of_dicts_preserved(self) -> None:
        obj = {
            "title": "x" * 20_000,
            "items": [{"a": 1}, {"a": 2}],
        }
        result = DataArtifacts._minimize_object(
            obj, character_limit=10, minimized_object_string_length=50
        )
        assert result["data"]["items"] == [{"a": 1}, {"a": 2}]

    def test_small_nested_plain_list_preserved(self) -> None:
        obj = {
            "title": "x" * 20_000,
            "tags": ["a", "b", "c"],
        }
        result = DataArtifacts._minimize_object(
            obj, character_limit=10, minimized_object_string_length=50
        )
        assert result["data"]["tags"] == ["a", "b", "c"]

    def test_large_nested_list_of_dicts_summarized(self) -> None:
        obj = {
            "title": "x" * 20_000,
            "employees": [{"name": f"Employee {i}", "salary": 50000 + i * 500} for i in range(100)],
        }
        result = DataArtifacts._minimize_object(
            obj, character_limit=10, minimized_object_string_length=50
        )
        assert "_total_rows" in result["data"]["employees"]

    def test_large_nested_plain_list_summarized(self) -> None:
        obj = {
            "title": "x" * 20_000,
            "values": [f"item_{i:04d}_with_extra_padding" for i in range(200)],
        }
        result = DataArtifacts._minimize_object(
            obj, character_limit=10, minimized_object_string_length=50
        )
        assert "_total_items" in result["data"]["values"]

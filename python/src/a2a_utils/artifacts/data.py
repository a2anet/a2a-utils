"""Data artifact viewing, minimization, selection, summary, and JSON path utilities."""

import json
import random
import statistics
from itertools import chain
from typing import Any, Union

from .text import TextArtifacts


class DataArtifacts:
    """Data artifact operations: viewing and minimization."""

    @staticmethod
    def view(
        data: Any,
        *,
        json_path: str | None = None,
        rows: Union[int, list[int], str, None] = None,
        columns: Union[str, list[str], None] = None,
        character_limit: int = 50_000,
    ) -> Any:
        """View structured data with optional filtering.

        Args:
            data: The data to view.
            json_path: Optional dot-separated path to extract specific fields.
            rows: Optional row selection.
            columns: Optional column selection.
            character_limit: Maximum output size in characters.

        Returns:
            Filtered data.

        Raises:
            ValueError: If parameters are invalid.
        """
        if json_path:
            data = DataArtifacts._evaluate_json_path(data, json_path)

        if rows is not None or columns is not None:
            if not isinstance(data, list):
                raise ValueError(
                    "rows/columns parameters require list data. "
                    f"The data at this path is a {type(data).__name__}. "
                    "Use json_path to navigate to a list field first."
                )

            if not data:
                raise ValueError("Cannot filter empty list.")

            is_tabular = isinstance(data[0], dict)

            if is_tabular:
                table_data: list[dict[str, Any]] = data
                available_columns = list(
                    dict.fromkeys(
                        chain.from_iterable(
                            item.keys() for item in table_data if isinstance(item, dict)
                        )
                    )
                )

                row_indices = DataArtifacts._parse_row_selection(
                    rows if rows is not None else "all", len(data)
                )
                column_names = DataArtifacts._parse_column_selection(
                    columns if columns is not None else "all", available_columns
                )

                filtered_data = DataArtifacts._filter_data_by_rows_and_columns(
                    table_data, row_indices, column_names
                )

                output_json = json.dumps(filtered_data, indent=2)
                if len(output_json) > character_limit:
                    raise ValueError(
                        f"The selection ({len(row_indices)} row(s) and "
                        f"{len(column_names)} column(s)) resulted in "
                        f"{len(output_json):,} characters, which exceeds the limit of "
                        f"{character_limit:,} characters. "
                        f"Try selecting fewer rows or columns."
                    )

                return filtered_data

            else:
                if columns is not None:
                    raise ValueError(
                        "columns parameter is only valid for lists of objects. "
                        "This list contains basic values. Use rows parameter only."
                    )

                row_indices = DataArtifacts._parse_row_selection(
                    rows if rows is not None else "all", len(data)
                )

                filtered_data = [data[i] for i in row_indices]

                output_json = json.dumps(filtered_data, indent=2)
                if len(output_json) > character_limit:
                    raise ValueError(
                        f"The selection ({len(row_indices)} item(s)) resulted in "
                        f"{len(output_json):,} characters, which exceeds the limit of "
                        f"{character_limit:,} characters. Try selecting fewer items."
                    )

                return filtered_data

        output_json = json.dumps(data, indent=2)
        if len(output_json) > character_limit:
            raise ValueError(
                f"Data output ({len(output_json):,} characters) exceeds the maximum "
                f"size of {character_limit:,} characters. "
                "Try using json_path to access specific fields, or rows/columns "
                "to filter list data."
            )

        return data

    @staticmethod
    def minimize(
        data: Any,
        *,
        character_limit: int = 50_000,
        minimized_object_string_length: int = 5_000,
        tip: str | None = None,
    ) -> dict[str, Any]:
        """Minimize data content for display based on type.

        Args:
            data: The data to minimize.
            character_limit: Character limit above which to minimize.
            minimized_object_string_length: Max length for string values in objects.
            tip: Tip to include. Defaults to None (no tip); pass a string to include one.

        Returns:
            Minimized representation with "data" or "text" key.
        """
        json_str = json.dumps(data, indent=2) if not isinstance(data, str) else data
        str_len = len(json_str)

        if str_len <= character_limit:
            return {"data": data}

        if isinstance(data, list) and data:
            if isinstance(data[0], dict):
                # Inline minimize_list_of_objects
                summary = DataArtifacts.summarize_table(data)

                result_data: dict[str, Any] = {
                    "_total_rows": len(data),
                    "_columns": summary,
                }

                if tip is not None:
                    result_data["_tip"] = tip

                result: dict[str, Any] = {"data": result_data}

                # Inflation guard
                minimized_size = len(json.dumps(result, indent=2))
                if minimized_size > str_len:
                    return {"data": data}

                return result

            summary_val = DataArtifacts.summarize_values(data)
            result_data = {
                "_total_items": len(data),
                "_summary": summary_val,
            }
            if tip is not None:
                result_data["_tip"] = tip
            result = {"data": result_data}

            # Inflation guard
            minimized_size = len(json.dumps(result, indent=2))
            if minimized_size > str_len:
                return {"data": data}

            return result

        if isinstance(data, dict):
            return DataArtifacts._minimize_object(
                data,
                character_limit=character_limit,
                minimized_object_string_length=minimized_object_string_length,
                tip=tip,
            )

        if isinstance(data, list):
            return {"data": data}

        if isinstance(data, str):
            return TextArtifacts.minimize(data, character_limit=character_limit, tip=tip)

        return {"data": data}

    @staticmethod
    def summarize_table(data: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Generate a comprehensive summary of tabular data (list of objects).

        Args:
            data: List of dictionaries representing table rows.

        Returns:
            List of column summaries, or the original data if the summary
            would be larger (inflation guard).
        """
        if not data:
            return []

        # Collect all unique column names (preserves order, handles sparse data)
        column_names = list(
            dict.fromkeys(
                chain.from_iterable(item.keys() for item in data if isinstance(item, dict))
            )
        )

        columns = []

        for column_name in column_names:
            # Collect all values for this column
            values = []
            for item in data:
                if isinstance(item, dict) and column_name in item:
                    values.append(item[column_name])

            # Use summarize_values to get statistics
            column_summary = DataArtifacts.summarize_values(values)
            if isinstance(column_summary, list):
                # Raw values smaller than summary — show raw values for this column
                columns.append({"name": column_name, "values": column_summary})
            else:
                column_summary["name"] = column_name
                columns.append(column_summary)

        # Overall inflation guard: if summary is bigger than original, return original
        if len(json.dumps(columns)) > len(json.dumps(data)):
            return data

        return columns

    @staticmethod
    def summarize_values(values: list[Any]) -> dict[str, Any] | list[Any]:
        """Generate a summary of a list of values (like a single column).

        Args:
            values: List of values to summarize.

        Returns:
            Dictionary with column-like statistics, or the original list if
            the summary would be larger (inflation guard).
        """
        if not values:
            return {"count": 0, "types": []}

        count = len(values)

        # Calculate unique count
        unique_values = []
        for v in values:
            if isinstance(v, (dict, list)):
                unique_values.append(json.dumps(v, sort_keys=True))
            else:
                unique_values.append(v)
        unique_count = len(set(unique_values))

        # Group values by type
        type_groups: dict[str, list[Any]] = {}
        for v in values:
            if v is None:
                type_name = "null"
            elif isinstance(v, bool):
                type_name = "bool"
            elif isinstance(v, int):
                type_name = "int"
            elif isinstance(v, float):
                type_name = "float"
            elif isinstance(v, str):
                type_name = "string"
            elif isinstance(v, list):
                type_name = "list"
            elif isinstance(v, dict):
                type_name = "object"
            else:
                type_name = type(v).__name__

            if type_name not in type_groups:
                type_groups[type_name] = []
            type_groups[type_name].append(v)

        # Build types array with stats included in each type
        types = []
        for type_name, type_values in sorted(type_groups.items(), key=lambda x: -len(x[1])):
            type_count = len(type_values)
            percentage = (type_count / count) * 100
            type_entry: dict[str, Any] = {
                "name": type_name,
                "count": type_count,
                "percentage": round(percentage, 1),
            }

            # Add sample value for this type
            type_entry["sample_value"] = random.choice(type_values)

            # Add type-specific statistics
            if type_name == "string":
                lengths = [len(s) for s in type_values]
                type_entry["length_minimum"] = min(lengths)
                type_entry["length_maximum"] = max(lengths)
                type_entry["length_average"] = round(statistics.mean(lengths), 2)
                if len(lengths) > 1:
                    type_entry["length_stdev"] = round(statistics.stdev(lengths), 2)
            elif type_name in ("int", "float"):
                type_entry["minimum"] = min(type_values)
                type_entry["maximum"] = max(type_values)
                type_entry["average"] = round(statistics.mean(type_values), 2)
                if len(type_values) > 1:
                    type_entry["stdev"] = round(statistics.stdev(type_values), 2)
            elif type_name == "object":
                json_lengths = [len(json.dumps(obj)) for obj in type_values]
                type_entry["json_length_minimum"] = min(json_lengths)
                type_entry["json_length_maximum"] = max(json_lengths)
                type_entry["json_length_average"] = round(statistics.mean(json_lengths), 2)
                if len(json_lengths) > 1:
                    type_entry["json_length_stdev"] = round(statistics.stdev(json_lengths), 2)
            elif type_name == "list":
                list_lengths = [len(lst) for lst in type_values]
                type_entry["length_minimum"] = min(list_lengths)
                type_entry["length_maximum"] = max(list_lengths)
                type_entry["length_average"] = round(statistics.mean(list_lengths), 2)
                if len(list_lengths) > 1:
                    type_entry["length_stdev"] = round(statistics.stdev(list_lengths), 2)
            types.append(type_entry)

        summary = {
            "count": count,
            "unique_count": unique_count,
            "types": types,
        }

        # Inflation guard: if summary is bigger than original, return original
        if len(json.dumps(summary)) > len(json.dumps(values)):
            return values

        return summary

    @staticmethod
    def _minimize_object(
        obj: dict[str, Any],
        *,
        character_limit: int = 50_000,
        minimized_object_string_length: int = 5_000,
        tip: str | None = None,
    ) -> dict[str, Any]:
        """Minimize an object for display.

        If JSON-stringified length is <= character_limit chars, return it in full.
        If > character_limit chars, show all keys but truncate string values and summarize lists.

        Args:
            obj: The object to minimize.
            character_limit: Character limit above which to minimize.
            minimized_object_string_length: Max length for string values.
            tip: Tip to include. Defaults to None (no tip); pass a string to include one.

        Returns:
            Dict with "data" key containing the minimized content.
        """
        json_str = json.dumps(obj, indent=2)
        if len(json_str) <= character_limit:
            return {"data": obj}

        minimized = DataArtifacts._minimize_object_values(
            obj, minimized_object_string_length=minimized_object_string_length
        )

        if tip is not None:
            minimized["_tip"] = tip

        result: dict[str, Any] = {"data": minimized}

        # Inflation guard: if minimized is larger than original, return original
        minimized_size = len(json.dumps(result, indent=2))
        original_size = len(json_str)
        if minimized_size > original_size:
            return {"data": obj}

        return result

    @staticmethod
    def _evaluate_json_path(data: Any, path: str) -> Any:
        """Evaluate a JSONPath-like expression for field access only.

        Supports:
        - "field" - top-level field
        - "field.nested" - nested field access

        Does NOT support array indexing - use rows/columns parameters instead.

        Args:
            data: The data to query
            path: The dot-separated field path

        Returns:
            The extracted value

        Raises:
            KeyError: If field doesn't exist
            TypeError: If trying to access field on non-object
        """
        if not path:
            return data

        parts = path.split(".")
        current = data

        for part in parts:
            if not isinstance(current, dict):
                raise TypeError(
                    f"Cannot access field '{part}' on {type(current).__name__}. "
                    f"Use rows/columns parameters to filter list data."
                )
            if part not in current:
                available = ", ".join(current.keys()) if current else "(empty)"
                raise KeyError(f"Field '{part}' not found. Available fields: {available}")
            current = current[part]

        return current

    @staticmethod
    def _parse_row_selection(
        rows: Union[int, list[int], str],
        total_rows: int,
    ) -> list[int]:
        """Parse the row selection parameter into a list of row indices.

        Args:
            rows: Can be a single row index (int), list of indices, range string ("0-10"), or "all"
            total_rows: Total number of rows in the dataset

        Returns:
            List of row indices to include
        """
        if isinstance(rows, int):
            # Single row - handle negative indices
            if rows < 0:
                rows = total_rows + rows
            if rows < 0 or rows >= total_rows:
                raise ValueError(
                    f"Row index {rows} is out of range for dataset with {total_rows} rows"
                )
            return [rows]
        elif isinstance(rows, list):
            # List of rows
            validated_rows = []
            for row in rows:
                if row < 0:
                    row = total_rows + row
                if row < 0 or row >= total_rows:
                    raise ValueError(
                        f"Row index {row} is out of range for dataset with {total_rows} rows"
                    )
                validated_rows.append(row)
            return validated_rows
        elif isinstance(rows, str):
            if rows == "all":
                return list(range(total_rows))
            # Range string like "0-10" or "0:-1"
            if "-" in rows:
                parts = rows.split("-", 1)
                if len(parts) != 2:
                    raise ValueError(
                        f"Invalid range format: {rows}. Expected format: 'start-end' (e.g., '0-10')"
                    )

                try:
                    start_str, end_str = parts
                    # Handle negative indices in string format
                    start = int(start_str) if start_str else 0
                    end = int(end_str) if end_str else total_rows

                    # Convert negative indices
                    if start < 0:
                        start = total_rows + start
                    if end < 0:
                        end = total_rows + end

                    # Validate range
                    if start < 0 or start >= total_rows:
                        raise ValueError(f"Start index {start} is out of range")
                    if end < 0 or end > total_rows:
                        raise ValueError(f"End index {end} is out of range")
                    if start > end:
                        raise ValueError(f"Start index {start} is greater than end index {end}")

                    return list(range(start, end))
                except ValueError as e:
                    if "invalid literal" in str(e):
                        raise ValueError(
                            f"Invalid range format: {rows}. Expected integers in 'start-end' format."
                        ) from e
                    raise
            else:
                raise ValueError(
                    f"Invalid row selection: {rows}. "
                    f"Must be an integer, list of integers, 'all', or a range like '0-10'"
                )
        else:
            raise ValueError(f"Invalid row selection type: {type(rows)}")

    @staticmethod
    def _parse_column_selection(
        columns: Union[str, list[str]],
        available_columns: list[str],
    ) -> list[str]:
        """Parse the column selection parameter into a list of column names.

        Args:
            columns: Can be a single column name (str), list of column names, or "all"
            available_columns: List of all available column names in the dataset

        Returns:
            List of column names to include
        """
        if isinstance(columns, str):
            if columns == "all":
                return available_columns
            # Single column
            if columns not in available_columns:
                raise ValueError(
                    f"Column '{columns}' not found. Available columns: {', '.join(available_columns)}"
                )
            return [columns]
        elif isinstance(columns, list):
            # List of columns
            for col in columns:
                if col not in available_columns:
                    raise ValueError(
                        f"Column '{col}' not found. Available columns: {', '.join(available_columns)}"
                    )
            return columns
        else:
            raise ValueError(f"Invalid column selection type: {type(columns)}")

    @staticmethod
    def _filter_data_by_rows_and_columns(
        data: list[dict[str, Any]],
        row_indices: list[int],
        column_names: list[str],
    ) -> list[dict[str, Any]]:
        """Filter data by row indices and column names.

        Args:
            data: The full dataset
            row_indices: List of row indices to include
            column_names: List of column names to include

        Returns:
            Filtered data
        """
        filtered_data = []

        for row_idx in row_indices:
            if row_idx >= len(data):
                continue

            row = data[row_idx]
            filtered_row = {}

            for col in column_names:
                if col in row:
                    filtered_row[col] = row[col]

            filtered_data.append(filtered_row)

        return filtered_data

    @staticmethod
    def _minimize_object_values(
        value: Any, *, minimized_object_string_length: int = 5_000, depth: int = 0, path: str = ""
    ) -> Any:
        """Recursively minimize values in an object."""
        if depth > 10:
            return "..."

        if isinstance(value, str):
            if len(value) > minimized_object_string_length:
                remaining = len(value) - minimized_object_string_length
                return f"{value[:minimized_object_string_length]}... [{remaining:,} more chars]"
            return value

        elif isinstance(value, dict):
            return {
                k: DataArtifacts._minimize_object_values(
                    v,
                    minimized_object_string_length=minimized_object_string_length,
                    depth=depth + 1,
                    path=f"{path}.{k}" if path else k,
                )
                for k, v in value.items()
            }

        elif isinstance(value, list):
            if not value:
                return value

            if isinstance(value[0], dict):
                table_result = DataArtifacts.summarize_table(value)
                summary_dict: dict[str, Any] = {
                    "_total_rows": len(value),
                    "_columns": table_result,
                }
                if path:
                    summary_dict["_json_path"] = path
                if len(json.dumps(summary_dict)) > len(json.dumps(value)):
                    return value
                return summary_dict

            val_result = DataArtifacts.summarize_values(value)
            summary_dict = {
                "_total_items": len(value),
                "_summary": val_result,
            }
            if path:
                summary_dict["_json_path"] = path
            if len(json.dumps(summary_dict)) > len(json.dumps(value)):
                return value
            return summary_dict

        else:
            return value

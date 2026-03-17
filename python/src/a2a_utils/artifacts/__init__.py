"""Artifact viewing and minimization utilities."""

from a2a.types import Artifact, DataPart, FilePart, FileWithBytes, FileWithUri, TextPart

from ..types import (
    ArtifactForLLM,
    DataPartForLLM,
    FilePartForLLM,
    TextPartForLLM,
)
from .data import DataArtifacts
from .text import TextArtifacts


def minimize_artifacts(
    artifacts: list[Artifact],
    *,
    character_limit: int = 50_000,
    minimized_object_string_length: int = 5_000,
    saved_file_paths: dict[str, list[str]] | None = None,
    text_tip: str | None = None,
    data_tip: str | None = None,
) -> list[ArtifactForLLM]:
    """Minimize artifact list for LLM display.

    Combines all TextParts within each artifact into a single TextPartForLLM.
    Handles FileParts by including file metadata and saved paths.

    Args:
        artifacts: List of artifacts to minimize.
        character_limit: Character limit above which to minimize.
        minimized_object_string_length: Max length for string values in objects.
        saved_file_paths: Mapping of artifact_id to saved file paths.
            When provided, file parts show saved locations.
            When None, FileWithBytes parts show an error and FileWithUri parts
            show the raw URI.
        text_tip: Tip string for minimized text artifacts. None = no tip.
        data_tip: Tip string for minimized data artifacts. None = no tip.

    Returns:
        List of ArtifactForLLM dataclasses.
    """
    result: list[ArtifactForLLM] = []
    for artifact in artifacts:
        parts: list[TextPartForLLM | DataPartForLLM | FilePartForLLM] = []

        # Combine all text parts into one
        text_segments: list[str] = []
        for part in artifact.parts:
            if isinstance(part.root, TextPart):
                text_segments.append(part.root.text)

        if text_segments:
            combined_text = "".join(text_segments)
            text_minimized = TextArtifacts.minimize(
                combined_text,
                character_limit=character_limit,
                tip=text_tip,
            )
            parts.append(TextPartForLLM(kind="text", text=text_minimized["text"]))

        # Each data part stays separate
        for part in artifact.parts:
            if isinstance(part.root, DataPart):
                data_minimized = DataArtifacts.minimize(
                    part.root.data,
                    character_limit=character_limit,
                    minimized_object_string_length=minimized_object_string_length,
                    tip=data_tip,
                )
                parts.append(DataPartForLLM(kind="data", data=data_minimized))

        # Handle file parts
        artifact_saved = (
            saved_file_paths.get(artifact.artifact_id) if saved_file_paths is not None else None
        )
        for part in artifact.parts:
            if isinstance(part.root, FilePart):
                file_obj = part.root.file
                name = file_obj.name
                mime_type = file_obj.mime_type

                if isinstance(file_obj, FileWithBytes):
                    if artifact_saved is not None:
                        file_part = FilePartForLLM(
                            kind="file",
                            name=name,
                            mime_type=mime_type,
                            uri=None,
                            bytes={"_saved_to": artifact_saved},
                        )
                    else:
                        file_part = FilePartForLLM(
                            kind="file",
                            name=name,
                            mime_type=mime_type,
                            uri=None,
                            bytes={"_error": "No FileStore configured. Cannot access file bytes."},
                        )
                elif isinstance(file_obj, FileWithUri):
                    if artifact_saved is not None:
                        file_part = FilePartForLLM(
                            kind="file",
                            name=name,
                            mime_type=mime_type,
                            uri={"_saved_to": artifact_saved},
                            bytes=None,
                        )
                    else:
                        file_part = FilePartForLLM(
                            kind="file",
                            name=name,
                            mime_type=mime_type,
                            uri=file_obj.uri,
                            bytes=None,
                        )
                else:
                    continue

                parts.append(file_part)

        result.append(
            ArtifactForLLM(
                artifact_id=artifact.artifact_id,
                description=artifact.description,
                name=artifact.name,
                parts=parts,
            )
        )

    return result


__all__ = [
    "DataArtifacts",
    "TextArtifacts",
    "minimize_artifacts",
]

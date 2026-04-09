"""Path safety utilities for filesystem-backed storage."""

from pathlib import Path
from .identifiers import UUID_RE, assert_uuid

SAFE_STORAGE_ID_RE = UUID_RE


def assert_safe_storage_id(name: str, value: str) -> None:
    """Reject IDs that could escape or corrupt the storage layout."""

    assert_uuid(name, value)


def assert_within_root(root: Path, target: Path) -> None:
    """Ensure a target path stays within the resolved storage root."""

    resolved_root = root.resolve()
    resolved_target = target.resolve(strict=False)

    try:
        resolved_target.relative_to(resolved_root)
    except ValueError as exc:
        raise ValueError(f"Path escapes storage root: '{target}'") from exc


def safe_join(root: Path, *segments: str) -> Path:
    """Join path segments while enforcing the storage root boundary."""

    target = root.joinpath(*segments)
    assert_within_root(root, target)
    return target

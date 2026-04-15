"""Shared identifier and remote file URI validation helpers."""

from collections.abc import Sequence
import re
from urllib.parse import SplitResult, urljoin, urlsplit

from a2a.types import Message, Task

UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)
IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9._-]+$")
DEFAULT_REMOTE_FILE_URI_SCHEMES = ("https:",)


def assert_uuid(name: str, value: str) -> None:
    """Ensure a value is a canonical UUID string."""

    if UUID_RE.fullmatch(value) is None:
        raise ValueError(f"Invalid {name}: '{value}'. Expected UUID.")


def assert_identifier(name: str, value: str) -> None:
    """Ensure an A2A identifier uses the filesystem-safe character set."""

    if IDENTIFIER_RE.fullmatch(value) is None or value in {".", ".."}:
        raise ValueError(f"Invalid {name}: '{value}'. Expected letters, numbers, '.', '_' or '-'.")


def assert_message_identifiers(message: Message) -> None:
    """Validate the message and attached task IDs carried in a message envelope."""

    assert_identifier("message id", message.message_id)
    if message.task_id is not None:
        assert_identifier("task id", message.task_id)


def assert_task_identifiers(task: Task) -> None:
    """Validate task, artifact, and nested message IDs."""

    assert_identifier("task id", task.id)
    if task.artifacts:
        for artifact in task.artifacts:
            assert_identifier("artifact id", artifact.artifact_id)
    if task.status.message is not None:
        assert_message_identifiers(task.status.message)
    if task.history:
        for message in task.history:
            assert_message_identifiers(message)


def normalize_allowed_uri_schemes(schemes: Sequence[str] | None) -> tuple[str, ...]:
    """Normalize and validate the configured remote file URI schemes."""

    values = tuple(schemes) if schemes is not None else DEFAULT_REMOTE_FILE_URI_SCHEMES
    if len(values) == 0:
        raise ValueError("allowed_uri_schemes must not be empty")

    normalized_values: list[str] = []
    seen: set[str] = set()
    for scheme in values:
        normalized = scheme.strip().lower()
        if re.fullmatch(r"[a-z][a-z0-9+.-]*:", normalized) is None:
            raise ValueError(f"Invalid URI scheme: '{scheme}'")
        if normalized not in seen:
            normalized_values.append(normalized)
            seen.add(normalized)

    return tuple(normalized_values)


def parse_remote_file_uri(
    uri: str,
    *,
    base: str | None = None,
    allowed_schemes: Sequence[str] | None = None,
) -> SplitResult:
    """Parse and validate a remote file URI against the allowed schemes."""

    candidate = urljoin(base, uri) if base is not None else uri
    url = urlsplit(candidate)
    protocol = f"{url.scheme.lower()}:"

    if not url.scheme or not url.netloc or url.hostname is None:
        raise ValueError(f"Invalid remote file URI: '{uri}'")
    if protocol not in normalize_allowed_uri_schemes(allowed_schemes):
        raise ValueError(f"Disallowed remote file URI scheme: '{protocol}'")
    if url.username is not None or url.password is not None:
        raise ValueError("Remote file URIs must not include credentials")

    return url

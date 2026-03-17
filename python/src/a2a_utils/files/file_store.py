"""FileStore abstract base class."""

from abc import ABC, abstractmethod

from a2a.types import Artifact


class FileStore(ABC):
    """Abstract base class for file storage."""

    @abstractmethod
    async def save(self, task_id: str, artifact: Artifact) -> list[str]:
        """Save file parts from an artifact.

        Returns list of storage locations where files were saved
        (e.g. local paths, cloud URIs, etc.).
        """

    @abstractmethod
    async def get(self, task_id: str, artifact_id: str) -> list[str]:
        """Get storage locations for a saved artifact's files.

        Returns empty list if not found.
        """

    @abstractmethod
    async def delete(self, task_id: str, artifact_id: str) -> None:
        """Delete saved files for an artifact."""

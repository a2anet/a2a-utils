"""FileStore abstract base class."""

from abc import ABC, abstractmethod

from a2a.types import Artifact, Message


class FileStore(ABC):
    """Abstract base class for file storage."""

    @abstractmethod
    async def save_artifact(self, task_id: str, artifact: Artifact) -> list[str]:
        """Save file parts from an artifact.

        Returns list of storage locations where files were saved
        (e.g. local paths, cloud URIs, etc.).
        """

    @abstractmethod
    async def get_artifact(self, task_id: str, artifact_id: str) -> list[str]:
        """Get storage locations for a saved artifact's files.

        Returns empty list if not found.
        """

    @abstractmethod
    async def delete_artifact(self, task_id: str, artifact_id: str) -> None:
        """Delete saved files for an artifact."""

    @abstractmethod
    async def save_message(self, message: Message) -> list[str]:
        """Save file parts from a message.

        Returns list of storage locations where files were saved
        (e.g. local paths, cloud URIs, etc.).
        """

    @abstractmethod
    async def get_message(self, message_id: str) -> list[str]:
        """Get storage locations for a saved message's files.

        Returns empty list if not found.
        """

    @abstractmethod
    async def delete_message(self, message_id: str) -> None:
        """Delete saved files for a message."""

import hashlib
import uuid
from pathlib import Path

PROJECT_NAMESPACE = uuid.UUID("164a4b22-43fb-432d-9e08-d4fd75111901")


def id_for_path(file_path: Path, project_root: Path) -> uuid.UUID:
    rel = file_path.resolve().relative_to(project_root.resolve()).as_posix()
    return uuid.uuid5(PROJECT_NAMESPACE, rel)

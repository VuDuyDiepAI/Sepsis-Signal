"""Private file adapter. No static mount; API checks ACL before serving."""

from pathlib import Path
import uuid
from .db import DATA


class LocalStorage:
    def __init__(self):
        self.root = DATA / "uploads"
        self.root.mkdir(exist_ok=True)

    def put(self, data, suffix):
        key = uuid.uuid4().hex + suffix
        self.path(key).write_bytes(data)
        return key

    def path(self, key):
        path = (self.root / key).resolve()
        if path.parent != self.root.resolve():
            raise ValueError("Invalid storage key")
        return path


storage = LocalStorage()

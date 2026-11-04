"""Package application source without local data or installed dependencies."""

from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import os

root = Path(__file__).resolve().parents[1]
destination = root.parent / "clinical-training-hub-source.zip"
temporary = destination.with_suffix(".zip.tmp")
excluded = {
    "node_modules",
    ".venv",
    ".git",
    "data",
    "__pycache__",
    ".pytest_cache",
    "test-results",
    "playwright-report",
    "dist",
    ".ruff_cache",
    "artifacts",
    "tests",
    "e2e",
}
with ZipFile(temporary, "w", ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if not path.is_file() or any(
            part in excluded or part.startswith("qa-runtime") for part in relative.parts
        ):
            continue
        if (
            path.name.startswith(".env") and path.name != ".env.example"
        ) or path.suffix.lower() in (
            ".log", ".tsbuildinfo", ".db", ".sqlite", ".sqlite3",
            ".zip", ".tmp", ".pem", ".key",
        ) or path.name.endswith((".db-wal", ".db-shm")):
            continue
        archive.write(path, Path(root.name) / relative)
os.replace(temporary, destination)
print(destination)
print(f"{destination.stat().st_size:,} bytes")

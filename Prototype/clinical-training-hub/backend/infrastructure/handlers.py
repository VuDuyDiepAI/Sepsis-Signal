"""Explicit background-job registration; no router imports or registration side effects."""

from backend.infrastructure.workers import handlers
from backend.modules.courses.generation import generate_job
from backend.modules.documents.ingestion import ingest


def register_handlers():
    handlers.update(INGEST=ingest, GENERATE_COURSE=generate_job)

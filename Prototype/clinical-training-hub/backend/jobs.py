import threading
from datetime import timedelta
from sqlalchemy import select, update
from fastapi import HTTPException
from .db import Session, now
from .models import BackgroundJob

handlers = {}


def run_job(job_id):
    with Session() as db:
        claimed = db.execute(
            update(BackgroundJob)
            .where(BackgroundJob.id == job_id, BackgroundJob.status == "QUEUED")
            .values(
                status="RUNNING", updated_at=now(), attempts=BackgroundJob.attempts + 1
            )
        )
        db.commit()
        if claimed.rowcount != 1:
            return
        job = db.get(BackgroundJob, job_id)
        try:
            job.result = handlers[job.kind](db, job)
            job.status = "COMPLETED"
            job.error = ""
            db.commit()
        except Exception as exc:
            db.rollback()
            job = db.get(BackgroundJob, job_id)
            job.status = "FAILED"
            job.error = (
                exc.detail
                if isinstance(exc, HTTPException)
                else "Không đọc được dữ liệu hoặc xử lý thất bại. Kiểm tra file/provider rồi thử lại."
            )
            if job.kind == "INGEST":
                from .models import DocumentVersion

                v = db.get(DocumentVersion, job.target_id)
                v.processing = "FAILED"
                v.error = job.error
        job.updated_at = now()
        db.commit()


def start_worker():
    stop = threading.Event()

    def loop():
        while not stop.is_set():
            try:
                with Session() as db:
                    db.execute(
                        update(BackgroundJob)
                        .where(
                            BackgroundJob.status == "RUNNING",
                            BackgroundJob.updated_at < now() - timedelta(minutes=5),
                        )
                        .values(status="QUEUED")
                    )
                    db.commit()
                    ids = list(
                        db.scalars(
                            select(BackgroundJob.id)
                            .where(BackgroundJob.status == "QUEUED")
                            .order_by(BackgroundJob.created_at)
                            .limit(10)
                        )
                    )
                for job_id in ids:
                    if stop.is_set():
                        break
                    run_job(job_id)
            except Exception:
                pass  # Queue persists; next tick retries transient DB errors. No sensitive payload logging.
            stop.wait(2)

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    return stop, thread

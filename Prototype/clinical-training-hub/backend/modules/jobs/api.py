from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import ensure_scope, require
from backend.infrastructure.workers import run_job
from backend.models.jobs import BackgroundJob
from backend.modules.jobs.services import job_access, job_departments

router = APIRouter(prefix="/api")


@router.get("/ai/jobs/{job_id}")
def job_detail(
    job_id: str, user=Depends(require("ADMIN")), db: Session = Depends(get_db)
):
    j = db.get(BackgroundJob, job_id)
    if not j or not job_access(db, user, j):
        raise HTTPException(404, "Không tìm thấy tác vụ.")
    return {
        k: getattr(j, k)
        for k in ("id", "kind", "status", "error", "attempts", "result")
    }


@router.get("/ai/jobs")
def job_list(user=Depends(require("ADMIN")), db: Session = Depends(get_db)):
    query = select(BackgroundJob).order_by(BackgroundJob.created_at.desc()).limit(100)
    return [
        {
            k: getattr(j, k)
            for k in (
                "id",
                "kind",
                "status",
                "error",
                "attempts",
                "result",
                "created_at",
            )
        }
        for j in db.scalars(query)
        if job_access(db, user, j)
    ]


@router.post("/ai/jobs/{job_id}/retry")
def retry_job(
    job_id: str,
    background: BackgroundTasks,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    j = db.get(BackgroundJob, job_id)
    if not j or not job_access(db, user, j):
        raise HTTPException(404, "Không tìm thấy tác vụ.")
    for dep in job_departments(db, j):
        ensure_scope(user, dep, "ADMIN")
    if j.status != "FAILED" or j.attempts >= 5:
        raise HTTPException(409, "Tác vụ chưa lỗi hoặc đã thử lại 5 lần.")
    j.status = "QUEUED"
    j.error = ""
    db.commit()
    background.add_task(run_job, j.id)
    return {"id": j.id, "status": j.status}

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db, today
from backend.core.security import ensure_scope, has_role, require
from backend.models.courses import CourseVersion
from backend.models.credentials import StaffCredential
from backend.models.identity import GroupMembership, StaffGroup, User
from backend.models.training import CourseAssignment
from backend.modules.credentials.services import credential_dict
from backend.modules.training.services import serialize_assignment

router = APIRouter(prefix="/api")


@router.get("/training/dashboard")
def dashboard(
    department_id: str = "",
    group_id: str = "",
    course_id: str = "",
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    if department_id:
        ensure_scope(user, department_id, "ADMIN")
    if group_id:
        group = db.get(StaffGroup, group_id)
        if not group:
            raise HTTPException(404, "Không tìm thấy nhóm.")
        ensure_scope(user, group.department_id, "ADMIN")
    assignments = []
    members = (
        set(
            db.scalars(
                select(GroupMembership.user_id).where(
                    GroupMembership.group_id == group_id
                )
            )
        )
        if group_id
        else None
    )
    for a in db.scalars(select(CourseAssignment)):
        u = db.get(User, a.user_id)
        if not has_role(user, "ADMIN", department_id=u.department_id):
            continue
        v = db.get(CourseVersion, a.course_version_id)
        if department_id and u.department_id != department_id:
            continue
        if members is not None and u.id not in members:
            continue
        if course_id and v.course_id != course_id:
            continue
        assignments.append(serialize_assignment(db, a))
    count = len(assignments)
    completed = sum((a["status"] == "COMPLETED" for a in assignments))
    started = sum((a["started_at"] is not None for a in assignments))
    scores = [a["best_score"] for a in assignments if a["best_score"] is not None]
    return {
        "total_staff": len({a["user_id"] for a in assignments}),
        "total_assignments": count,
        "started": started,
        "completed": completed,
        "completion_rate": round(completed / count * 100, 1) if count else 0,
        "average_score": round(sum(scores) / len(scores), 1) if scores else None,
        "overdue": sum((a["status"] == "OVERDUE" for a in assignments)),
        "assignments": assignments,
        "upcoming_credentials": [
            credential_dict(db, c)
            for c in db.scalars(select(StaffCredential))
            if (
                not department_id
                or db.get(User, c.user_id).department_id == department_id
            )
            and has_role(
                user, "ADMIN", department_id=db.get(User, c.user_id).department_id
            )
            and (members is None or c.user_id in members)
            and (
                (date.fromisoformat(c.expiry_date) - today()).days
                <= max(c.reminder_days or [30])
            )
        ],
    }

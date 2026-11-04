from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db, today
from backend.core.security import has_role, require
from backend.models.identity import User
from backend.models.notifications import Reminder
from backend.models.training import CourseAssignment

router = APIRouter(prefix="/api")


@router.get("/reminders")
def reminders(user=Depends(require("ADMIN", "STAFF")), db: Session = Depends(get_db)):
    result = []
    for r in db.scalars(
        select(Reminder)
        .where(Reminder.scheduled_date <= today().isoformat())
        .order_by(Reminder.scheduled_date.desc())
    ):
        if (
            not has_role(
                user, "ADMIN", department_id=db.get(User, r.user_id).department_id
            )
            and r.user_id != user.id
        ):
            continue
        if r.assignment_id and db.get(CourseAssignment, r.assignment_id).completed_at:
            continue
        result.append(
            {
                "id": r.id,
                "title": r.message,
                "date": r.scheduled_date,
                "user_id": r.user_id,
            }
        )
    return result

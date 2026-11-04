from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import audit, ensure_scope, has_role, require
from backend.models.calendar import TrainingEvent
from backend.models.courses import CourseVersion
from backend.models.credentials import StaffCredential
from backend.models.identity import Department, GroupMembership, StaffGroup, User
from backend.models.training import CourseAssignment
from backend.modules.calendar.schemas import EventInput
from backend.modules.training.services import assignment_status

router = APIRouter(prefix="/api")


@router.post("/training/events")
def create_event(
    body: EventInput, user=Depends(require("ADMIN")), db: Session = Depends(get_db)
):
    ensure_scope(user, body.department_id, "ADMIN")
    if not db.get(Department, body.department_id):
        raise HTTPException(422, "Khoa/phòng không hợp lệ.")
    if body.group_id:
        group = db.get(StaffGroup, body.group_id)
        if not group or group.department_id != body.department_id:
            raise HTTPException(422, "Nhóm không thuộc khoa/phòng này.")
    starts = body.starts_at
    if starts.tzinfo is None:
        from zoneinfo import ZoneInfo

        starts = starts.replace(tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"))
    event = TrainingEvent(
        **body.model_dump(exclude={"starts_at"}),
        starts_at=starts.astimezone(timezone.utc).replace(tzinfo=None),
        creator_id=user.id,
    )
    db.add(event)
    db.flush()
    audit(db, user, "training.event-create", event.id, department_id=body.department_id)
    db.commit()
    return {"id": event.id}


@router.get("/training/calendar")
def calendar(user=Depends(require("ADMIN", "STAFF")), db: Session = Depends(get_db)):
    result = []
    groups = set(
        db.scalars(
            select(GroupMembership.group_id).where(GroupMembership.user_id == user.id)
        )
    )
    for e in db.scalars(select(TrainingEvent)):
        if has_role(user, "ADMIN", department_id=e.department_id) or (
            e.department_id == user.department_id
            and (not e.group_id or e.group_id in groups)
        ):
            result.append(
                {
                    "id": e.id,
                    "type": "event",
                    "title": e.title,
                    "date": e.starts_at.isoformat() + "Z",
                    "location": e.location,
                }
            )
    for a in db.scalars(select(CourseAssignment)):
        if (
            has_role(user, "ADMIN", department_id=db.get(User, a.user_id).department_id)
            or a.user_id == user.id
        ):
            result.append(
                {
                    "id": a.id,
                    "type": "assignment",
                    "title": "Hạn học: "
                    + db.get(CourseVersion, a.course_version_id).title,
                    "date": a.due_date,
                    "status": assignment_status(a),
                }
            )
    for c in db.scalars(select(StaffCredential)):
        if (
            has_role(user, "ADMIN", department_id=db.get(User, c.user_id).department_id)
            or c.user_id == user.id
        ):
            result.append(
                {
                    "id": c.id,
                    "type": "credential",
                    "title": "Hết hạn: " + c.title,
                    "date": c.expiry_date,
                }
            )
    return sorted(result, key=lambda x: x["date"])

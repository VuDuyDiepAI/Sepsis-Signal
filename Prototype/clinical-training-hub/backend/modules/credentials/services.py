from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import delete

from backend.core.database import today
from backend.core.security import audit, ensure_scope
from backend.models.credentials import StaffCredential
from backend.models.identity import User
from backend.models.notifications import Reminder


def credential_dict(db, c):
    days = (date.fromisoformat(c.expiry_date) - today()).days
    return {
        "id": c.id,
        "user_id": c.user_id,
        "name": db.get(User, c.user_id).name,
        "title": c.title,
        "kind": c.kind,
        "issuer": c.issuer,
        "issue_date": c.issue_date,
        "expiry_date": c.expiry_date,
        "verified": c.verified,
        "days_left": days,
        "reminder_days": c.reminder_days,
        "reminder_dates": [
            (date.fromisoformat(c.expiry_date) - timedelta(days=d)).isoformat()
            for d in c.reminder_days
        ],
        "alert": days <= max(c.reminder_days),
    }


def save_credential(db, body, user, c=None):
    target = db.get(User, body.user_id)
    if not target:
        raise HTTPException(422, "Nhân viên không tồn tại.")
    ensure_scope(user, target.department_id, "ADMIN")
    if c:
        ensure_scope(user, db.get(User, c.user_id).department_id, "ADMIN")
    values = body.model_dump()
    values.update(
        issue_date=body.issue_date.isoformat(),
        expiry_date=body.expiry_date.isoformat(),
        reminder_days=sorted(set(body.reminder_days), reverse=True),
    )
    if not c:
        c = StaffCredential(**values)
        db.add(c)
        db.flush()
    else:
        for key, value in values.items():
            setattr(c, key, value)
        db.execute(delete(Reminder).where(Reminder.credential_id == c.id))
    for days in c.reminder_days:
        db.add(
            Reminder(
                user_id=c.user_id,
                credential_id=c.id,
                scheduled_date=(
                    date.fromisoformat(c.expiry_date) - timedelta(days=days)
                ).isoformat(),
                message="Chứng chỉ sắp hết hạn: " + c.title[:240],
            )
        )
    audit(db, user, "credential.save", c.id, department_id=target.department_id)
    db.commit()
    return credential_dict(db, c)

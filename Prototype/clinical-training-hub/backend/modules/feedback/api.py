from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import audit, departments_for, has_role, require
from backend.models.feedback import Feedback
from backend.modules.feedback.schemas import FeedbackInput, FeedbackStatus
from backend.modules.feedback.services import feedback_dict

router = APIRouter(prefix="/api")


@router.post("/feedback")
def send_feedback(
    body: FeedbackInput, user=Depends(require("STAFF")), db: Session = Depends(get_db)
):
    item = Feedback(
        user_id=user.id, department_id=user.department_id, **body.model_dump()
    )
    db.add(item)
    db.flush()
    audit(db, user, "feedback.create", item.id)
    db.commit()
    return {"id": item.id, "status": item.status}


@router.get("/feedback/mine")
def my_feedback(user=Depends(require("STAFF")), db: Session = Depends(get_db)):
    return [
        feedback_dict(db, f)
        for f in db.scalars(
            select(Feedback)
            .where(Feedback.user_id == user.id)
            .order_by(Feedback.created_at.desc())
        )
    ]


@router.get("/admin/feedback")
def all_feedback(user=Depends(require("ADMIN")), db: Session = Depends(get_db)):
    values = list(
        db.scalars(
            select(Feedback)
            .where(Feedback.department_id.in_(departments_for(user, "ADMIN")))
            .order_by(Feedback.created_at.desc())
        )
    )
    features = {}
    for f in values:
        features.setdefault(f.feature, []).append(f.rating)
    return {
        "total": len(values),
        "average_rating": round(sum((f.rating for f in values)) / len(values), 1)
        if values
        else None,
        "by_feature": [
            {"feature": k, "count": len(v), "average": round(sum(v) / len(v), 1)}
            for k, v in features.items()
        ],
        "items": [feedback_dict(db, f) for f in values],
    }


@router.put("/admin/feedback/{fid}")
def update_feedback(
    fid: str,
    body: FeedbackStatus,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    f = db.get(Feedback, fid)
    if not f or not has_role(user, "ADMIN", department_id=f.department_id):
        raise HTTPException(404, "Không tìm thấy phản hồi.")
    if body.status not in ("NEW", "REVIEWING", "RESOLVED"):
        raise HTTPException(422, "Trạng thái không hợp lệ.")
    f.status = body.status
    audit(db, user, "feedback.status", fid)
    db.commit()
    return feedback_dict(db, f)

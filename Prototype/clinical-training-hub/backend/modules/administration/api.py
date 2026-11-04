import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import departments_for, has_role, public_user, require
from backend.models.administration import AuditLog
from backend.models.identity import GroupMembership, StaffGroup, User
from backend.modules.administration.schemas import UserInput
from backend.modules.administration.services import save_user

router = APIRouter(prefix="/api")


@router.post("/admin/users")
def create_user(
    body: UserInput, user=Depends(require("ADMIN")), db: Session = Depends(get_db)
):
    return save_user(db, body, user)


@router.put("/admin/users/{uid}")
def edit_user(
    uid: str,
    body: UserInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Không tìm thấy nhân viên.")
    return save_user(db, body, user, u)


@router.get("/admin/memberships")
def memberships(user=Depends(require("ADMIN")), db: Session = Depends(get_db)):
    return [
        {"user_id": m.user_id, "group_id": m.group_id}
        for m in db.scalars(select(GroupMembership))
        if has_role(
            user, "ADMIN", department_id=db.get(StaffGroup, m.group_id).department_id
        )
    ]


@router.get("/admin/settings")
def settings(user=Depends(require("ADMIN")), db: Session = Depends(get_db)):
    return {
        "demo_mode": os.getenv("DEMO_MODE", "true").lower() == "true",
        "ai_provider": os.getenv("AI_PROVIDER", "demo"),
        "ai_model": os.getenv("AI_MODEL", "qwen2.5:7b"),
        "embedding_model": os.getenv("AI_EMBEDDING_MODEL", "bge-m3"),
        "external_ai_allowed": os.getenv("ALLOW_EXTERNAL_AI", "false").lower()
        == "true",
        "api_key_configured": bool(os.getenv("AI_API_KEY")),
        "storage": "Local private storage",
        "max_upload_mb": 15,
        "database": "PostgreSQL" if db.bind.dialect.name == "postgresql" else "SQLite",
        "provider_note": "Provider và secrets được quản lý qua environment. Thay cấu hình cần khởi động lại dịch vụ.",
    }


@router.get("/admin/users")
def users(
    scope: str = "training",
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    if scope == "admin" and (not has_role(user, "ADMIN")):
        raise HTTPException(403, "Bạn không có quyền quản trị.")
    visible = (
        departments_for(user, "ADMIN")
        if scope == "admin"
        else departments_for(user, "ADMIN")
    )
    return [
        public_user(u, visible)
        for u in db.scalars(
            select(User).where(User.department_id.in_(visible)).order_by(User.name)
        )
    ]


@router.get("/admin/audit")
def logs(user=Depends(require("ADMIN")), db: Session = Depends(get_db)):
    return [
        {
            "id": a.id,
            "action": a.action,
            "user_id": a.user_id,
            "target_id": a.target_id,
            "created_at": a.created_at,
        }
        for a in db.scalars(
            select(AuditLog)
            .where(AuditLog.department_id.in_(departments_for(user, "ADMIN")))
            .order_by(AuditLog.created_at.desc())
            .limit(200)
        )
    ]

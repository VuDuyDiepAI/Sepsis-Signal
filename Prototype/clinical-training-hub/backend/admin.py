import os
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, delete, func
from sqlalchemy.orm import Session
from .db import get_db
from .models import *
from .auth import (
    current_user,
    require,
    hash_password,
    public_user,
    audit,
    has_role,
    ensure_scope,
    departments_for,
)
from .seed import ROLES

router = APIRouter(prefix="/api")


class FeedbackInput(BaseModel):
    feature: str = Field(min_length=2, max_length=120)
    rating: int = Field(ge=1, le=5)
    positives: str = Field(default="", max_length=4000)
    issues: str = Field(default="", max_length=4000)
    suggestions: str = Field(default="", max_length=4000)


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


def feedback_dict(db, f):
    return {
        **{
            k: getattr(f, k)
            for k in (
                "id",
                "feature",
                "rating",
                "positives",
                "issues",
                "suggestions",
                "status",
                "created_at",
            )
        },
        "name": db.get(User, f.user_id).name,
    }


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
        "average_rating": round(sum(f.rating for f in values) / len(values), 1)
        if values
        else None,
        "by_feature": [
            {"feature": k, "count": len(v), "average": round(sum(v) / len(v), 1)}
            for k, v in features.items()
        ],
        "items": [feedback_dict(db, f) for f in values],
    }


class FeedbackStatus(BaseModel):
    status: str


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


class RoleGrantInput(BaseModel):
    role: Literal["ADMIN", "REVIEWER", "STAFF"]
    department_id: str
    review_specialties: list[str] = Field(default_factory=list, max_length=30)


class UserInput(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254)
    staff_code: str = Field(min_length=2, max_length=50)
    title: str = Field(default="Điều dưỡng", max_length=120)
    department_id: str
    active: bool = True
    password: str | None = Field(default=None, min_length=10, max_length=200)
    roles: list[Literal["ADMIN", "REVIEWER", "STAFF"]] | None = Field(default=None, min_length=1, max_length=1)
    review_specialties: list[str] = Field(default_factory=list, max_length=30)
    role_grants: list[RoleGrantInput] | None = Field(default=None, max_length=100)
    group_ids: list[str] = Field(default_factory=list, max_length=30)


def default_roles(title):
    return (
        ["ADMIN"]
        if title in ("Trưởng khoa (Bác sĩ)", "Trưởng khoa", "Điều dưỡng trưởng")
        else ["STAFF"]
    )


def save_user(db, body, admin, u=None):
    ensure_scope(admin, body.department_id, "ADMIN")
    if u:
        ensure_scope(admin, u.department_id, "ADMIN")
    if not db.get(Department, body.department_id) or "@" not in body.email:
        raise HTTPException(422, "Khoa/phòng hoặc email chưa hợp lệ.")
    email = body.email.strip().lower()
    if db.scalar(
        select(User).where(
            func.lower(User.email) == email, User.id != (u.id if u else "")
        )
    ) or db.scalar(
        select(User).where(
            func.lower(User.staff_code) == body.staff_code.strip().lower(),
            User.id != (u.id if u else ""),
        )
    ):
        raise HTTPException(
            409,
            "Email hoặc mã nhân viên đã tồn tại. Mỗi nhân viên chỉ có một tài khoản.",
        )
    admin_deps = departments_for(admin, "ADMIN")
    if body.role_grants is not None:
        grants = [g.model_dump() for g in body.role_grants]
    else:
        roles = (
            body.roles
            if body.roles is not None
            else (
                sorted(
                    {
                        g.role_id
                        for g in u.role_grants
                        if g.department_id == body.department_id
                    }
                )
                if u
                else default_roles(body.title)
            )
        )
        specialties = body.review_specialties
        if u and body.roles is None and not specialties:
            specialties = next(
                (
                    list(g.review_specialties)
                    for g in u.role_grants
                    if g.role_id == "REVIEWER" and g.department_id == body.department_id
                ),
                [],
            )
        if not specialties and not u and body.roles is None and "REVIEWER" in roles:
            specialties = [
                {"emergency": "Cấp cứu", "icu": "Hồi sức tích cực"}.get(
                    body.department_id, db.get(Department, body.department_id).name
                )
            ]
        grants = [
            {
                "role": r,
                "department_id": body.department_id,
                "review_specialties": specialties if r == "REVIEWER" else [],
            }
            for r in roles
        ]
    if not grants or len({g["role"] for g in grants}) != 1:
        raise HTTPException(422,"Mỗi tài khoản phải có đúng một vai trò: Admin, Reviewer hoặc Staff.")
    if not any(g["department_id"]==body.department_id for g in grants):
        raise HTTPException(422,"Cần cấp vai trò trong khoa/phòng chính của tài khoản.")
    if body.roles is not None and set(body.roles)!={g["role"] for g in grants}:
        raise HTTPException(422,"Vai trò và phạm vi cấp quyền không khớp.")
    normalized = {}
    for g in grants:
        if g["role"] not in ROLES:
            raise HTTPException(422, "Quyền hệ thống không hợp lệ.")
        ensure_scope(admin, g["department_id"], "ADMIN")
        specs = sorted({s.strip() for s in g["review_specialties"] if s.strip()})
        if g["role"] == "REVIEWER" and (
            not specs or any(s == "*" or len(s) > 120 for s in specs)
        ):
            raise HTTPException(
                422,
                "Quyền Reviewer cần chỉ rõ chuyên môn được phân công; không chấp nhận phạm vi tất cả.",
            )
        normalized[(g["role"], g["department_id"])] = (
            specs if g["role"] == "REVIEWER" else []
        )
    preserved = list(db.scalars(select(UserRole).where(UserRole.user_id==u.id,~UserRole.department_id.in_(admin_deps)))) if u else []
    if any(g.role_id!=next(iter(normalized))[0] for g in preserved):
        raise HTTPException(409,"Không thể đổi vai trò khi tài khoản còn phạm vi thuộc khoa khác. Cần quản trị viên có đủ phạm vi xử lý.")
    if u and u.id == admin.id:
        if not body.active or any(
            ("ADMIN", dep) not in normalized for dep in admin_deps
        ):
            raise HTTPException(
                409,
                "Không thể tự vô hiệu hóa hoặc thu hồi phạm vi quản trị của chính mình.",
            )
    for gid in body.group_ids:
        group = db.get(StaffGroup, gid)
        if not group or group.department_id != body.department_id:
            raise HTTPException(422, "Nhóm không thuộc khoa/phòng của nhân viên.")
    values = body.model_dump(
        exclude={"password", "group_ids", "roles", "role_grants", "review_specialties"}
    )
    values["email"] = email
    values["staff_code"] = body.staff_code.strip()
    if not u:
        if not body.password:
            raise HTTPException(422, "Cần mật khẩu cho tài khoản mới.")
        u = User(**values, role="STAFF", password_hash=hash_password(body.password))
        db.add(u)
        db.flush()
    else:
        for k, v in values.items():
            setattr(u, k, v)
        if body.password:
            u.password_hash = hash_password(body.password)
        if body.password or not body.active:
            db.execute(delete(AuthSession).where(AuthSession.user_id == u.id))
        db.execute(delete(GroupMembership).where(GroupMembership.user_id == u.id))
    db.execute(
        delete(UserRole).where(
            UserRole.user_id == u.id, UserRole.department_id.in_(admin_deps)
        )
    )
    db.add_all(
        UserRole(
            user_id=u.id, role_id=role, department_id=dep, review_specialties=specs
        )
        for (role, dep), specs in normalized.items()
    )
    u.role = next(iter(normalized))[0]
    db.add_all(
        GroupMembership(user_id=u.id, group_id=gid) for gid in set(body.group_ids)
    )
    audit(db, admin, "user.permissions", u.id, department_id=u.department_id)
    db.commit()
    db.expire(u, ["role_grants"])
    return public_user(u, admin_deps)


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


class OrgInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    department_id: str | None = None


@router.post("/admin/organization/{kind}")
def create_org(
    kind: str,
    body: OrgInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    if kind == "departments":
        raise HTTPException(
            403,
            "Quản trị cấp khoa không được tạo khoa mới hoặc tự mở rộng phạm vi. Chỉ được cập nhật khoa đã được cấp quyền.",
        )
    elif kind == "groups":
        ensure_scope(user, body.department_id, "ADMIN")
        if not db.get(Department, body.department_id):
            raise HTTPException(422, "Cần chọn khoa/phòng hợp lệ.")
        item = StaffGroup(name=body.name, department_id=body.department_id)
    else:
        raise HTTPException(404, "Không tìm thấy loại tổ chức.")
    db.add(item)
    db.flush()
    audit(db, user, "organization.create", item.id, department_id=body.department_id)
    db.commit()
    return {"id": item.id, "name": item.name}


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


@router.put("/admin/organization/departments/{did}")
def edit_department(
    did: str,
    body: OrgInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    ensure_scope(user, did, "ADMIN")
    d = db.get(Department, did)
    if not d:
        raise HTTPException(404, "Không tìm thấy khoa/phòng.")
    if db.scalar(
        select(Department.id).where(Department.name == body.name, Department.id != did)
    ):
        raise HTTPException(409, "Tên khoa/phòng đã tồn tại.")
    d.name = body.name
    audit(db, user, "organization.update", did, department_id=did)
    db.commit()
    return {"id": d.id, "name": d.name}


@router.put("/admin/organization/groups/{gid}")
def edit_group(
    gid: str,
    body: OrgInput,
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    group = db.get(StaffGroup, gid)
    if not group:
        raise HTTPException(404, "Không tìm thấy nhóm.")
    ensure_scope(user, group.department_id, "ADMIN")
    if body.department_id and body.department_id != group.department_id:
        raise HTTPException(422, "Không thay khoa của nhóm đang có thành viên.")
    group.name = body.name
    audit(db, user, "organization.update", gid, department_id=group.department_id)
    db.commit()
    return {"id": group.id, "name": group.name}

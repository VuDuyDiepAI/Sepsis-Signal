from fastapi import HTTPException
from sqlalchemy import delete, func, select

from backend.bootstrap.seed import ROLES
from backend.core.security import (
    audit,
    departments_for,
    ensure_scope,
    hash_password,
    public_user,
)
from backend.models.identity import (
    AuthSession,
    Department,
    GroupMembership,
    StaffGroup,
    User,
    UserRole,
)


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
            else sorted(
                {
                    g.role_id
                    for g in u.role_grants
                    if g.department_id == body.department_id
                }
            )
            if u
            else default_roles(body.title)
        )
        specialties = body.review_specialties
        if u and body.roles is None and (not specialties):
            specialties = next(
                (
                    list(g.review_specialties)
                    for g in u.role_grants
                    if g.role_id == "REVIEWER" and g.department_id == body.department_id
                ),
                [],
            )
        if (
            not specialties
            and (not u)
            and (body.roles is None)
            and ("REVIEWER" in roles)
        ):
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
        raise HTTPException(
            422, "Mỗi tài khoản phải có đúng một vai trò: Admin, Reviewer hoặc Staff."
        )
    if not any((g["department_id"] == body.department_id for g in grants)):
        raise HTTPException(
            422, "Cần cấp vai trò trong khoa/phòng chính của tài khoản."
        )
    if body.roles is not None and set(body.roles) != {g["role"] for g in grants}:
        raise HTTPException(422, "Vai trò và phạm vi cấp quyền không khớp.")
    normalized = {}
    for g in grants:
        if g["role"] not in ROLES:
            raise HTTPException(422, "Quyền hệ thống không hợp lệ.")
        ensure_scope(admin, g["department_id"], "ADMIN")
        specs = sorted({s.strip() for s in g["review_specialties"] if s.strip()})
        if g["role"] == "REVIEWER" and (
            not specs or any((s == "*" or len(s) > 120 for s in specs))
        ):
            raise HTTPException(
                422,
                "Quyền Reviewer cần chỉ rõ chuyên môn được phân công; không chấp nhận phạm vi tất cả.",
            )
        normalized[g["role"], g["department_id"]] = (
            specs if g["role"] == "REVIEWER" else []
        )
    preserved = (
        list(
            db.scalars(
                select(UserRole).where(
                    UserRole.user_id == u.id, ~UserRole.department_id.in_(admin_deps)
                )
            )
        )
        if u
        else []
    )
    if any((g.role_id != next(iter(normalized))[0] for g in preserved)):
        raise HTTPException(
            409,
            "Không thể đổi vai trò khi tài khoản còn phạm vi thuộc khoa khác. Cần quản trị viên có đủ phạm vi xử lý.",
        )
    if u and u.id == admin.id:
        if not body.active or any(
            (("ADMIN", dep) not in normalized for dep in admin_deps)
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
        (
            UserRole(
                user_id=u.id, role_id=role, department_id=dep, review_specialties=specs
            )
            for (role, dep), specs in normalized.items()
        )
    )
    u.role = next(iter(normalized))[0]
    db.add_all(
        (GroupMembership(user_id=u.id, group_id=gid) for gid in set(body.group_ids))
    )
    audit(db, admin, "user.permissions", u.id, department_id=u.department_id)
    db.commit()
    db.expire(u, ["role_grants"])
    return public_user(u, admin_deps)

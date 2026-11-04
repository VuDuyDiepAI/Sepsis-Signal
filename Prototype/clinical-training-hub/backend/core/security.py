import hashlib
import hmac
import secrets
from datetime import timedelta

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from backend.core.database import get_db, now
from backend.models.administration import AuditLog
from backend.models.identity import AuthSession, Department, User


def hash_password(password: str):
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(
        password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
    ).hex()
    return f"{salt}${digest}"


def verify_password(password, stored):
    salt, digest = stored.split("$")
    return hmac.compare_digest(
        hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
        ).hex(),
        digest,
    )


def current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("hub_session") or request.headers.get(
        "Authorization", ""
    ).removeprefix("Bearer ")
    session = (
        db.scalar(
            select(AuthSession).where(
                AuthSession.token_hash == hashlib.sha256(token.encode()).hexdigest(),
                AuthSession.expires_at > now(),
            )
        )
        if token
        else None
    )
    user = db.get(User, session.user_id) if session else None
    if not user or not user.active:
        raise HTTPException(401, "Vui lòng đăng nhập để tiếp tục.")
    return user


def require(*roles):

    def dependency(user: User = Depends(current_user)):
        if not has_role(user, *roles):
            raise HTTPException(403, "Bạn không có quyền thực hiện thao tác này.")
        return user

    return dependency


def system_role(user):
    roles = {g.role_id for g in user.role_grants}
    if roles & {"ADMIN", "MANAGER"}:
        return "ADMIN"
    if "REVIEWER" in roles:
        return "REVIEWER"
    return "STAFF" if "STAFF" in roles else None


def has_role(user, *roles, department_id=None):
    mode = system_role(user)
    return any(
        (
            g.role_id == mode
            and g.role_id in roles
            and (department_id is None or g.department_id == department_id)
            for g in user.role_grants
        )
    )


def departments_for(user, *roles):
    mode = system_role(user)
    return {
        g.department_id
        for g in user.role_grants
        if g.role_id == mode and (not roles or g.role_id in roles)
    }


def ensure_scope(user, department_id, *roles):
    if not has_role(user, *roles, department_id=department_id):
        raise HTTPException(
            403, "Bạn không có quyền này trong khoa/phòng được yêu cầu."
        )


def can_review(user, doc):
    if system_role(user) != "REVIEWER":
        return False
    return any(
        (
            g.role_id == "REVIEWER"
            and g.department_id == doc.department_id
            and (
                doc.specialty.strip().casefold()
                in {s.strip().casefold() for s in g.review_specialties}
            )
            for g in user.role_grants
        )
    )


def can_inspect(user, doc):
    return has_role(user, "ADMIN", department_id=doc.department_id) or can_review(
        user, doc
    )


def audit(db, user, action, target="", detail="", department_id=None):
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            target_id=target,
            detail=detail,
            department_id=department_id or (user.department_id if user else None),
        )
    )


def public_user(u, visible_departments=None):
    result = {
        k: getattr(u, k)
        for k in (
            "id",
            "name",
            "email",
            "department_id",
            "staff_code",
            "title",
            "active",
        )
    }
    grants = [
        {
            "role": g.role_id,
            "department_id": g.department_id,
            "review_specialties": g.review_specialties,
        }
        for g in u.role_grants
        if g.role_id == system_role(u)
        and (visible_departments is None or g.department_id in visible_departments)
    ]
    result.update(roles=sorted({g["role"] for g in grants}), role_grants=grants)
    db = object_session(u)
    result["department_name"] = db.get(Department, u.department_id).name if db else ""
    return result


def issue_session(db, user):
    token = secrets.token_urlsafe(48)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=now() + timedelta(hours=12),
        )
    )
    return token

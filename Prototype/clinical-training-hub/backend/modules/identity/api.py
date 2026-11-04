import os
from collections import defaultdict, deque
from time import monotonic

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.security import (
    audit,
    current_user,
    issue_session,
    public_user,
    verify_password,
)
from backend.models.identity import AuthSession, User
from backend.modules.identity.schemas import Login

router = APIRouter(prefix="/api")


attempts = defaultdict(deque)


@router.post("/auth/login")
def login(
    body: Login, request: Request, response: Response, db: Session = Depends(get_db)
):
    key = request.client.host if request.client else "local"
    queue = attempts[key]
    while queue and monotonic() - queue[0] > 60:
        queue.popleft()
    if len(queue) >= 15:
        raise HTTPException(
            429, "Đăng nhập quá nhiều lần. Vui lòng thử lại sau một phút."
        )
    user = db.scalar(
        select(User).where(
            User.email == body.email.lower().strip(), User.active == True
        )
    )
    if not user or not verify_password(body.password, user.password_hash):
        queue.append(monotonic())
        raise HTTPException(401, "Email hoặc mật khẩu không chính xác.")
    token = issue_session(db, user)
    response.set_cookie(
        "hub_session",
        token,
        httponly=True,
        samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "false") == "true",
        max_age=43200,
    )
    audit(db, user, "auth.login")
    db.commit()
    return public_user(user)


@router.post("/auth/logout")
def logout(
    request: Request,
    response: Response,
    user=Depends(current_user),
    db: Session = Depends(get_db),
):
    import hashlib

    token = request.cookies.get("hub_session", "")
    db.execute(
        delete(AuthSession).where(
            AuthSession.token_hash == hashlib.sha256(token.encode()).hexdigest()
        )
    )
    db.commit()
    response.delete_cookie("hub_session")
    return {"ok": True}


@router.get("/auth/me")
def me(user=Depends(current_user)):
    return public_user(user)

import os
from pathlib import Path
from collections import defaultdict, deque
from time import monotonic
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from .db import get_db, Session as DBSession
from .models import User, AuthSession, Department, StaffGroup, AuditLog
from .auth import (
    current_user,
    require,
    verify_password,
    public_user,
    issue_session,
    audit,
    has_role,
    departments_for,
)
from .seed import seed


@asynccontextmanager
async def lifespan(app):
    with DBSession() as db:
        seed(db)
        from .demo import seed_content

        seed_content(db)
    from .jobs import start_worker

    stop, thread = start_worker()
    yield
    stop.set()
    thread.join(timeout=3)


app = FastAPI(
    title="Vinmec AI Clinical Training Hub", version="0.1.0", lifespan=lifespan
)


@app.middleware("http")
async def protections(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if (
            origin
            and origin != str(request.base_url).rstrip("/")
            and origin
            not in os.getenv(
                "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
            ).split(",")
        ):
            return JSONResponse({"detail": "Nguồn yêu cầu không được phép."}, 403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
    )
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(Exception)
async def internal_error(request, exc):
    return JSONResponse(
        {"detail": "Xử lý thất bại. Vui lòng thử lại hoặc liên hệ quản trị viên."}, 500
    )


class Login(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(min_length=1, max_length=200)


attempts = defaultdict(deque)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "demo_mode": os.getenv("DEMO_MODE", "true").lower() == "true",
        "ai_provider": os.getenv("AI_PROVIDER", "demo"),
    }


@app.post("/api/auth/login")
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


@app.post("/api/auth/logout")
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


@app.get("/api/auth/me")
def me(user=Depends(current_user)):
    return public_user(user)


@app.get("/api/organization")
def organization(user=Depends(current_user), db: Session = Depends(get_db)):
    return {
        "departments": [
            {
                "id": d.id,
                "name": d.name,
                "can_admin": has_role(user, "ADMIN", department_id=d.id),
                "can_manage": has_role(user, "ADMIN", department_id=d.id),
            }
            for d in db.scalars(select(Department))
            if d.id in departments_for(user)
        ],
        "groups": [
            {
                "id": g.id,
                "name": g.name,
                "department_id": g.department_id,
                "can_admin": has_role(user, "ADMIN", department_id=g.department_id),
                "can_manage": has_role(user, "ADMIN", department_id=g.department_id),
            }
            for g in db.scalars(select(StaffGroup))
            if g.department_id in departments_for(user)
        ],
    }


@app.get("/api/admin/users")
def users(
    scope: str = "training",
    user=Depends(require("ADMIN")),
    db: Session = Depends(get_db),
):
    if scope == "admin" and not has_role(user, "ADMIN"):
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


@app.get("/api/admin/audit")
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


from .knowledge import router as knowledge_router

app.include_router(knowledge_router)
from .courses import router as course_router

app.include_router(course_router)
from .training import router as training_router

app.include_router(training_router)
from .admin import router as admin_router

app.include_router(admin_router)

dist = Path(__file__).resolve().parents[1] / "dist"
if dist.exists():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/")
    def frontend():
        return FileResponse(dist / "index.html")

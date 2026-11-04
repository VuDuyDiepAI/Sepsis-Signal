import os

from fastapi import Request
from fastapi.responses import JSONResponse


async def protections(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if (
            origin
            and origin != str(request.base_url).rstrip("/")
            and (
                origin
                not in os.getenv(
                    "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
                ).split(",")
            )
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


async def internal_error(request, exc):
    return JSONResponse(
        {"detail": "Xử lý thất bại. Vui lòng thử lại hoặc liên hệ quản trị viên."}, 500
    )

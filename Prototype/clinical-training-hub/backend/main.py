"""Application entry point; keep `backend.main:app` stable for local and Docker startup."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.api.middleware import internal_error, protections
from backend.api.router import router
from backend.bootstrap.lifecycle import lifespan

app = FastAPI(
    title="Vinmec AI Clinical Training Hub", version="0.1.0", lifespan=lifespan
)
app.middleware("http")(protections)
app.exception_handler(Exception)(internal_error)
app.include_router(router)

dist = Path(__file__).resolve().parents[1] / "dist"
if dist.exists():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/")
    def frontend():
        return FileResponse(dist / "index.html")

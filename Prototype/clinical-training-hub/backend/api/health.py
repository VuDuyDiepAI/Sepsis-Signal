import os

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/health")
def health():
    return {
        "status": "ok",
        "demo_mode": os.getenv("DEMO_MODE", "true").lower() == "true",
        "ai_provider": os.getenv("AI_PROVIDER", "demo"),
    }

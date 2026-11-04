"""Stream research requests without forwarding hub credentials to the search service."""

import os
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.core.security import require

router = APIRouter(
    prefix="/api/research",
    dependencies=[Depends(require("STAFF", "ADMIN", "REVIEWER"))],
)


class ResearchQuery(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    demo: bool = False


async def forward(method: str, path: str, body: dict | None = None):
    base = os.getenv("RESEARCH_API_URL", "http://127.0.0.1:8000").rstrip("/")
    client = httpx.AsyncClient(timeout=httpx.Timeout(180, connect=5))
    try:
        request = client.build_request(method, f"{base}/api/{path}", json=body)
        response = await client.send(request, stream=True)
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(
            502, "Không kết nối được dịch vụ nghiên cứu. Kiểm tra RESEARCH_API_URL."
        ) from None
    if response.status_code != 200:
        status = response.status_code
        await response.aclose()
        await client.aclose()
        raise HTTPException(
            404 if status == 404 else 502,
            "Dịch vụ nghiên cứu chưa trả được dữ liệu.",
        )

    async def content():
        try:
            async for chunk in response.aiter_bytes():
                yield chunk
        except httpx.HTTPError:
            if path == "search/stream":
                yield b'\n{"type":"error","message":"Research service connection interrupted."}\n'
        finally:
            await response.aclose()
            await client.aclose()

    headers = {"Cache-Control": "no-store", "X-Accel-Buffering": "no"}
    if "content-disposition" in response.headers:
        headers["Content-Disposition"] = response.headers["content-disposition"]
    return StreamingResponse(
        content(),
        media_type=response.headers.get("content-type", "application/x-ndjson"),
        headers=headers,
    )


@router.post("/search/stream")
async def search(query: ResearchQuery):
    return await forward("POST", "search/stream", query.model_dump())


@router.get("/runs/{run_id}/{kind}")
async def download(
    kind: Literal["log", "trace"],
    run_id: str = Path(pattern=r"^\d{6}_\d{2}_\d{2}_[0-9a-f]{32}$"),
):
    return await forward("GET", f"runs/{run_id}/{kind}")

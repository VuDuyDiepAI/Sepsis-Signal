from datetime import datetime

from pydantic import BaseModel, Field


class EventInput(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    starts_at: datetime
    location: str = Field(default="", max_length=240)
    department_id: str = "emergency"
    group_id: str | None = None

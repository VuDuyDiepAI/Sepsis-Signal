from pydantic import BaseModel, Field


class ReviewInput(BaseModel):
    version_id: str
    comment: str = Field(default="", max_length=4000)

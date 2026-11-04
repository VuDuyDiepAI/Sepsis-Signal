from pydantic import BaseModel, Field


class FeedbackInput(BaseModel):
    feature: str = Field(min_length=2, max_length=120)
    rating: int = Field(ge=1, le=5)
    positives: str = Field(default="", max_length=4000)
    issues: str = Field(default="", max_length=4000)
    suggestions: str = Field(default="", max_length=4000)


class FeedbackStatus(BaseModel):
    status: str

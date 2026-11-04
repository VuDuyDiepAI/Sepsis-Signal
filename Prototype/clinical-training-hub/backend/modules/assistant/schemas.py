from pydantic import BaseModel, Field


class Query(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    conversation_id: str | None = None
    document_id: str | None = None
    department_id: str | None = None
    topic: str | None = None


class Rating(BaseModel):
    helpful: bool

from pydantic import BaseModel, Field


class LessonInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    objective: str = Field(min_length=1, max_length=4000)
    content: str = Field(min_length=1, max_length=20000)
    key_points: list[str] = Field(default_factory=list, max_length=20)
    citation_ids: list[str] = Field(min_length=1, max_length=20)


class ChecklistInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(min_length=1, max_length=4000)
    critical: bool = False
    citation_ids: list[str] = Field(min_length=1, max_length=20)


class QuestionInput(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    options: list[str] = Field(min_length=4, max_length=4)
    correct: int = Field(ge=0, le=3)
    explanation: str = Field(min_length=1, max_length=4000)
    difficulty: str = "Cơ bản"
    citation_ids: list[str] = Field(min_length=1, max_length=20)


class ContentInput(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    description: str = Field(max_length=4000)
    audience: str = Field(max_length=240)
    objectives: list[str] = Field(min_length=1, max_length=20)
    duration: int = Field(ge=1, le=600)
    pass_score: int = Field(default=80, ge=1, le=100)
    lessons: list[LessonInput] = Field(min_length=1, max_length=30)
    checklist: list[ChecklistInput] = Field(min_length=1, max_length=100)
    questions: list[QuestionInput] = Field(min_length=1, max_length=50)
    storyboard: list[dict] = Field(default_factory=list, max_length=30)
    expected_version_id: str | None = None


class Generate(BaseModel):
    version_ids: list[str] = Field(min_length=1, max_length=5)


class ApprovalInput(BaseModel):
    version_id: str
    comment: str = Field(default="", max_length=4000)

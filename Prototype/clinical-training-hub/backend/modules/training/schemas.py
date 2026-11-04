from datetime import date

from pydantic import BaseModel, Field, model_validator


class AssignmentInput(BaseModel):
    course_id: str
    user_ids: list[str] = Field(default_factory=list, max_length=300)
    group_id: str | None = None
    department_id: str | None = None
    due_date: date

    @model_validator(mode="after")
    def one_target(self):
        if (
            sum([bool(self.user_ids), bool(self.group_id), bool(self.department_id)])
            != 1
        ):
            raise ValueError("Chọn một loại đối tượng phân công.")
        return self


class ProgressInput(BaseModel):
    assignment_id: str
    lesson_id: str


class SubmitQuiz(BaseModel):
    assignment_id: str
    answers: dict[str, int]

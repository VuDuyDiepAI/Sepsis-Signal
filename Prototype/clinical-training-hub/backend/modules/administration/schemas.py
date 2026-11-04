from typing import Literal

from pydantic import BaseModel, Field


class RoleGrantInput(BaseModel):
    role: Literal["ADMIN", "REVIEWER", "STAFF"]
    department_id: str
    review_specialties: list[str] = Field(default_factory=list, max_length=30)


class UserInput(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254)
    staff_code: str = Field(min_length=2, max_length=50)
    title: str = Field(default="Điều dưỡng", max_length=120)
    department_id: str
    active: bool = True
    password: str | None = Field(default=None, min_length=10, max_length=200)
    roles: list[Literal["ADMIN", "REVIEWER", "STAFF"]] | None = Field(
        default=None, min_length=1, max_length=1
    )
    review_specialties: list[str] = Field(default_factory=list, max_length=30)
    role_grants: list[RoleGrantInput] | None = Field(default=None, max_length=100)
    group_ids: list[str] = Field(default_factory=list, max_length=30)

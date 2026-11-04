from datetime import date

from pydantic import BaseModel, Field, model_validator


class CredentialInput(BaseModel):
    user_id: str
    title: str = Field(min_length=3, max_length=240)
    kind: str = Field(default="Đào tạo nội bộ", max_length=120)
    issuer: str = Field(min_length=2, max_length=240)
    issue_date: date
    expiry_date: date
    verified: bool = False
    reminder_days: list[int] = Field(default=[30, 14, 7], min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.expiry_date <= self.issue_date or any(
            (d < 1 or d > 365 for d in self.reminder_days)
        ):
            raise ValueError("Ngày hết hạn hoặc mốc nhắc không hợp lệ.")
        return self

"""Strict JSON contracts compatible with the existing hourly UI."""
from datetime import datetime
from typing import Literal, Annotated
import math
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, field_validator, model_validator

Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Hour = Annotated[StrictInt, Field(ge=0, le=36)]


def local(value: str):
    import re
    if not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?', value):
        raise ValueError('Thời gian phải là giờ địa phương ISO không kèm múi giờ.')
    return datetime.fromisoformat(value)


class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Profile(Contract):
    id: Annotated[StrictStr, Field(pattern=r'^HS-[A-F0-9]{8}$')]
    t0: StrictStr
    age: Annotated[StrictInt, Field(ge=18, le=120)]
    sex: Literal['F', 'M']
    height: Annotated[Number, Field(ge=80, le=250)] | None
    weight: Annotated[Number, Field(ge=20, le=400)] | None
    comorbidities: dict[str, StrictBool]

    @field_validator('t0')
    @classmethod
    def valid_t0(cls, v):
        local(v)
        return v


class Vitals(Contract):
    heart_rate_bpm: Annotated[Number, Field(ge=20, le=250)]
    respiratory_rate_per_min: Annotated[Number, Field(ge=4, le=70)]
    sbp_mmhg: Annotated[Number, Field(ge=40, le=300)]
    dbp_mmhg: Annotated[Number, Field(ge=20, le=200)] | None
    map_mmhg: Annotated[Number, Field(ge=20, le=250)] | None
    spo2_pct: Annotated[Number, Field(ge=40, le=100)] | None
    temperature_c: Annotated[Number, Field(ge=25, le=45)] | None
    gcs: Annotated[Number, Field(ge=3, le=15)] | None

    @model_validator(mode='after')
    def physiological_order(self):
        if self.dbp_mmhg is not None and self.dbp_mmhg >= self.sbp_mmhg:
            raise ValueError('HA tâm trương (DBP) phải nhỏ hơn HA tâm thu (SBP).')
        return self


LAB_BOUNDS: dict[str, tuple[float, float, str]] = {
    'WBC': (0.0, 500.0, '10^9/L'),
    'platelets': (0.0, 2000.0, '10^9/L'),
    'creatinine': (0.0, 30.0, 'mg/dL'),
    'bilirubin_total': (0.0, 80.0, 'mg/dL'),
    'CRP': (0.0, 1000.0, 'mg/L'),
    'procalcitonin': (0.0, 500.0, 'ng/mL'),
}


class EntryBase(Contract):
    hour: Hour
    measuredAt: StrictStr
    availableAt: StrictStr
    collectedAt: StrictStr
    labAvailableAt: StrictStr
    department: Literal['ED', 'WARD', 'ICU']
    vitals: Vitals | None
    labs: dict[Literal['WBC', 'platelets', 'creatinine', 'bilirubin_total', 'CRP', 'procalcitonin'], Number]
    symptoms: dict[str, StrictBool] | None

    @field_validator('measuredAt', 'availableAt', 'collectedAt', 'labAvailableAt')
    @classmethod
    def valid_time(cls, v):
        local(v)
        return v

    @field_validator('labs')
    @classmethod
    def valid_raw_labs(cls, v):
        if any(not math.isfinite(x) or not 0 <= x <= 100000 for x in v.values()):
            raise ValueError('Giá trị xét nghiệm ngoài phạm vi nhập liệu.')
        return v


class Entry(EntryBase):
    @field_validator('labs')
    @classmethod
    def valid_canonical_labs(cls, v):
        for code, x in v.items():
            lo, hi, unit = LAB_BOUNDS[code]
            if not math.isfinite(x) or not lo <= x <= hi:
                raise ValueError(
                    f'Giá trị {code} ngoài phạm vi sinh lý ({lo:g}–{hi:g} {unit}). '
                    f'Kiểm tra lại đơn vị nhập (mg/dL vs µmol/L).'
                )
        return v


def validate_entry(profile: dict, entry: dict):
    from datetime import timedelta
    t0 = local(profile['t0'])
    at = t0 + timedelta(hours=entry['hour'])
    if not (t0 <= local(entry['measuredAt']) <= at and t0 <= local(entry['collectedAt']) <= at
            and local(entry['availableAt']) >= local(entry['measuredAt'])
            and local(entry['labAvailableAt']) >= local(entry['collectedAt'])):
        raise ValueError('Giờ đo/lấy mẫu phải từ T0 đến mốc đang nhập; giờ có dữ liệu không được trước giờ đo/lấy mẫu.')


class ScoreInput(Contract):
    profile: Profile
    entries: Annotated[list[Entry], Field(max_length=37)]
    hours: Annotated[list[Hour], Field(max_length=37)]

    @model_validator(mode='after')
    def temporal(self):
        seen = set()
        for entry in self.entries:
            validate_entry(self.profile.model_dump(), entry.model_dump())
            if entry.hour in seen:
                raise ValueError('Trùng mốc giờ nhập.')
            seen.add(entry.hour)
        return self


class SaveInput(Contract):
    revision: Annotated[StrictInt, Field(ge=0)]
    entry: Entry


class Revision(Contract):
    revision: Annotated[StrictInt, Field(ge=0)]


class Login(Contract):
    username: Annotated[StrictStr, Field(min_length=1, max_length=80)]
    password: Annotated[StrictStr, Field(min_length=1, max_length=200)]


class ReviewInput(Contract):
    predictionId: Annotated[StrictStr, Field(min_length=1, max_length=200)]
    revision: Annotated[StrictInt, Field(ge=1)]
    requestId: StrictStr
    note: Annotated[StrictStr, Field(max_length=1000)]

    @field_validator('requestId')
    @classmethod
    def uuid_request(cls, v):
        from uuid import UUID
        UUID(v)
        return v

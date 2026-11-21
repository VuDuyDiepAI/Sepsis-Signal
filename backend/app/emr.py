"""Canonical EMR adapter. Hospital-specific HL7/FHIR mapping is an external boundary."""
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from typing import Annotated
from uuid import uuid4
from pydantic import Field, StrictInt, StrictStr
from sqlalchemy import select, insert, update, text

from backend.app.schemas import Contract, Entry, Profile, local, validate_entry
from backend.app.db import tables as t
from backend.app.db.store import ClinicalError, dump


class EMREvent(Contract):
    source: Annotated[StrictStr, Field(min_length=1,max_length=80)]
    eventId: Annotated[StrictStr, Field(min_length=1,max_length=160)]
    eventVersion: Annotated[StrictInt, Field(ge=1)]
    encounterId: Annotated[StrictStr, Field(pattern=r'^HS-[A-F0-9]{8}$')]
    profile: Profile | None = None
    entry: Entry
    units: dict[str, StrictStr]


UNITS = {'WBC':'10^9/L','platelets':'10^9/L','creatinine':'mg/dL','bilirubin_total':'mg/dL',
         'CRP':'mg/L','procalcitonin':'ng/mL'}


def normalize(event: EMREvent):
    entry = event.entry.model_dump()
    for code, value in entry['labs'].items():
        unit = event.units.get(code)
        if unit == UNITS[code]:
            continue
        if code == 'creatinine' and unit == 'umol/L':
            entry['labs'][code] = value / 88.4
        elif code == 'bilirubin_total' and unit == 'umol/L':
            entry['labs'][code] = value / 17.1
        elif code == 'CRP' and unit == 'mg/dL':
            entry['labs'][code] = value * 10
        else:
            raise ClinicalError(f'Chưa có ánh xạ đơn vị cho {code}.',422)
    return Entry.model_validate(entry).model_dump()


def ingest(store, event: EMREvent, received_at=None):
    # Persist original EMR timestamps and receipt separately. The effective
    # availability used for inference can never precede receipt by this system.
    received = received_at or datetime.now(timezone.utc)
    if received.tzinfo is None:
        raise ValueError('received_at must have timezone')
    received_local = received.astimezone(timezone(timedelta(hours=7))).replace(tzinfo=None, microsecond=0)
    raw = event.model_dump()
    entry = normalize(event)
    if any(local(entry[key]) > received_local for key in ('measuredAt','availableAt','collectedAt','labAvailableAt')):
        raise ClinicalError('Sự kiện EMR chứa thời điểm trong tương lai so với lúc tiếp nhận.',422)
    with store.transaction() as c:
        if store.postgres:
            event_key=int.from_bytes(hashlib.sha256(('event:'+event.source+':'+event.eventId).encode()).digest()[:8],'big',signed=True)
            c.execute(text('SELECT pg_advisory_xact_lock(:key)'),{'key':event_key})
            key=int.from_bytes(hashlib.sha256(('emr:'+event.encounterId).encode()).digest()[:8],'big',signed=True)
            c.execute(text('SELECT pg_advisory_xact_lock(:key)'),{'key':key})
        prior = c.execute(select(t.emr).where(t.emr.c.source == event.source,t.emr.c.event_id == event.eventId,
            t.emr.c.event_version == event.eventVersion)).mappings().first()
        if prior:
            if json.loads(prior['payload']) != raw:
                raise ClinicalError('Mã/phiên bản sự kiện đã tồn tại với nội dung khác.')
            return {'eventId':prior['id'],'duplicate':True,'revision':store._case(c,event.encounterId)['revision']}
        latest = c.execute(select(t.emr.c.event_version,t.emr.c.encounter_id).where(t.emr.c.source == event.source,
            t.emr.c.event_id == event.eventId).order_by(t.emr.c.event_version.desc()).limit(1)).first()
        if latest and (latest.event_version > event.eventVersion or latest.encounter_id != event.encounterId):
            raise ClinicalError('Phiên bản sự kiện cũ hoặc thay đổi mã lượt khám.')
        record = store._case(c,event.encounterId,lock=True)
        if not record:
            if not event.profile or event.profile.id != event.encounterId:
                raise ClinicalError('Cần thông tin hồ sơ khi tiếp nhận lượt khám mới.',422)
            store._create(c,event.profile.model_dump())
            record = store._case(c,event.encounterId,lock=True)
        elif event.profile and event.profile.model_dump() != record['profile']:
            raise ClinicalError('Thông tin hồ sơ không khớp lượt khám hiện tại.')
        t0 = local(record['profile']['t0'])
        # The scoring horizon stays the same. Events outside the supported
        # observation period are rejected explicitly rather than clamped/backdated.
        available = max(local(entry['availableAt']),received_local)
        lab_available = max(local(entry['labAvailableAt']),received_local)
        hour = math.ceil((max(available,lab_available)-t0).total_seconds()/3600)
        if not 0 <= hour <= 36:
            raise ClinicalError('Sự kiện ngoài khoảng theo dõi T0–T0+36 giờ.',422)
        entry |= {'availableAt':available.isoformat(timespec='seconds'),
                  'labAvailableAt':lab_available.isoformat(timespec='seconds'),'hour':hour}
        try:
            validate_entry(record['profile'],entry)
        except ValueError as exc:
            raise ClinicalError(str(exc),422) from exc
        if len(record['entries']) >= 2000:
            raise ClinicalError('Đã đạt giới hạn sự kiện của lượt khám.',413)
        c.execute(update(t.emr).where(t.emr.c.source == event.source,t.emr.c.event_id == event.eventId).values(active=0))
        event_id = str(uuid4())
        c.execute(insert(t.emr).values(id=event_id,source=event.source,event_id=event.eventId,event_version=event.eventVersion,
            encounter_id=event.encounterId,payload=dump(raw),entry_json=dump(entry),received_at=received.isoformat(),active=1))
        fresh = store._invalidate(c,record,hour,'emr:'+event.source)
        return {'eventId':event_id,'duplicate':False,'revision':fresh['revision'],'hour':hour}

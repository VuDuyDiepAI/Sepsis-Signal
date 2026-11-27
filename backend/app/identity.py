"""Legacy web identity compatibility, including ECMAScript number formatting."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import hashlib
import json
import math


def js_json(value):
    if value is None or isinstance(value, (str, bool, int)):
        return json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError('Non-finite JSON number')
        if value == 0:
            return '0'
        if 1e-6 <= abs(value) < 1e21:
            return format(Decimal(repr(value)), 'f').rstrip('0').rstrip('.') if '.' in format(Decimal(repr(value)), 'f') else format(Decimal(repr(value)), 'f')
        mantissa, exponent = repr(value).lower().split('e')
        exponent = int(exponent)
        return f"{mantissa.rstrip('0').rstrip('.') if '.' in mantissa else mantissa}e{'+' if exponent >= 0 else '-'}{abs(exponent)}"
    if isinstance(value, list):
        return '[' + ','.join(js_json(v) for v in value) + ']'
    if isinstance(value, dict):
        return '{' + ','.join(js_json(k) + ':' + js_json(v) for k, v in value.items()) + '}'
    raise TypeError(type(value).__name__)


def fixture_prediction(original, source_hash):
    payload = {k: original[k] for k in sorted(original) if k != 'id'}
    raw = js_json({'sourceId': original['id'], 'payload': payload, 'source': source_hash})
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return payload | {'id': f"{original['encounterId']}:{original['hour']}:{original['revision']}:f-{digest}"}


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def prediction_time(t0, hour):
    value = datetime.fromisoformat(t0).replace(tzinfo=timezone(timedelta(hours=7))) + timedelta(hours=hour)
    return value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

"""Smoke the manual entry, watchlist, monitoring, and sample-case pages."""
from datetime import datetime
from pathlib import Path

import pytest
from streamlit.testing.v1 import AppTest

from src.manual_cases import create_case, prediction_history

ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(
    not (ROOT / 'artifacts/mock_emr_hourly_lr/sepsis_model.joblib').exists(),
    reason='Run scripts/train_mock_emr.py first',
)


def test_manual_journey_and_other_pages(tmp_path, monkeypatch):
    monkeypatch.setenv('SEPSIS_MANUAL_DB', str(tmp_path / 'manual.sqlite3'))
    t0 = datetime(2026, 1, 1, 8)
    case_id = create_case(triage_completed_at=t0, age_years=60, sex='F')
    app = AppTest.from_file(str(ROOT / 'app/streamlit_app.py'), default_timeout=90).run()
    assert not app.exception
    assert app.title[0].value == 'Chạy ca mẫu'

    app = app.switch_page('views/1_manual.py').run()
    assert not app.exception
    assert app.title[0].value == 'Theo dõi người bệnh'
    assert any(box.label == 'Hồ sơ' and box.value == case_id for box in app.selectbox)
    for label, value in [('Nhịp tim (lần/phút)', 90), ('Nhịp thở (lần/phút)', 20), ('HA tâm thu (mmHg)', 120)]:
        next(n for n in app.number_input if n.label == label).set_value(value)
    next(b for b in app.button if b.label == 'Lưu dữ liệu và chấm điểm').click()
    app = app.run()
    assert not app.exception
    assert any(m.label == 'Điểm sepsis' for m in app.metric)
    assert [p['target'] for p in prediction_history(case_id)] == ['sepsis']
    next(n for n in app.text_input if n.label == 'Người ghi nhận').set_value('Bác sĩ thử nghiệm')
    next(b for b in app.button if b.label == 'Đã xem xét kết quả').click()
    app = app.run()
    assert not app.exception
    assert any('Đã xem xét' in message.value for message in app.success)
    app = app.run()
    assert any('Bác sĩ thử nghiệm' in message.value for message in app.success)
    next(b for b in app.button if b.label == 'Cập nhật mốc T0+2h').click()
    app = app.run()
    assert not app.exception
    assert any(n.label == 'Giờ sau T0' and n.value == 2 for n in app.number_input)
    next(b for b in app.button if b.label == 'Lưu dữ liệu và chấm điểm').click()
    app = app.run()
    assert not app.exception
    assert [p['target'] for p in prediction_history(case_id)] == ['sepsis', 'sepsis']

    app = app.switch_page('views/2_manual_watchlist.py').run()
    assert not app.exception
    assert any(m.label == 'Hồ sơ theo dõi' and m.value == '1' for m in app.metric)

    app = app.switch_page('views/3_model_monitoring.py').run()
    assert not app.exception
    assert any(m.label == 'Phát hiện trong 6h · holdout' for m in app.metric)

    app = app.switch_page('views/4_sample_case.py').run()
    assert not app.exception
    assert app.title[0].value == 'Chạy ca mẫu'

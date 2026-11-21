"""The manual UI bridge must preserve as-of scoring and not persist clinical data."""
from scripts.score_frontend_case import score


def payload():
    return {'profile': {'t0': '2026-11-19T08:00', 'age': 55, 'sex': 'F',
                        'height': 170, 'weight': 70, 'comorbidities': {}},
            'hours': [0, 1, 2], 'entries': [{
                'hour': 0, 'measuredAt': '2026-11-19T08:00', 'availableAt': '2026-11-19T08:00',
                'collectedAt': '2026-11-19T08:00', 'labAvailableAt': '2026-11-19T10:00',
                'department': 'ED', 'vitals': {'heart_rate_bpm': 90, 'respiratory_rate_per_min': 18,
                'sbp_mmhg': 120}, 'labs': {'CRP': 180}, 'symptoms': None}]}


def test_bridge_obeys_t0_and_late_lab_availability():
    data = payload()
    delayed = score(data)
    assert [p['hour'] for p in delayed['predictions']] == [1, 2]
    data['entries'][0]['labs'] = {}
    without = score(data)
    assert delayed['predictions'][0]['score'] == without['predictions'][0]['score']
    assert delayed['predictions'][1]['featureHash'] != without['predictions'][1]['featureHash']


def test_bridge_drops_predictions_when_corrected_input_is_insufficient():
    data = payload()
    data['entries'][0]['vitals'] = None
    result = score(data)
    assert result['predictions'] == []
    assert set(result['errors']) == {'1', '2'}

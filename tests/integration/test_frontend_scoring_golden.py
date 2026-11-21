"""Frozen scoring contract: inputs, model identity, threshold and decisions."""
import hashlib
import json
from pathlib import Path

import pytest

from scripts.score_frontend_case import score

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = json.loads((ROOT / 'tests/fixtures/sepsis_scoring_golden.json').read_text(encoding='utf-8'))


def test_golden_model_and_workbook_identity():
    for name, expected in GOLDEN['sourceSha256'].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name


@pytest.mark.parametrize('case', GOLDEN['cases'], ids=lambda case: case['name'])
def test_bridge_matches_frozen_predictions(case):
    actual = score(case['input'])
    expected = case['expected']
    assert sorted(actual['errors'], key=int) == expected['errorHours']
    assert len(actual['predictions']) == len(expected['predictions'])
    for prediction, reference in zip(actual['predictions'], expected['predictions']):
        assert prediction['score'] == pytest.approx(reference['score'], abs=1e-12, rel=0)
        assert (prediction['score'] >= prediction['threshold']) is reference['alert']
        for key in ('hour', 'threshold', 'modelVersion', 'availableFeatures', 'department', 'featureHash'):
            assert prediction[key] == reference[key], key

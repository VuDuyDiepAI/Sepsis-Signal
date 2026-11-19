"""Temporal and as-of checks for the synthetic hourly EMR."""
import numpy as np
import pandas as pd
import pytest

from src.mock_emr import (FEATURES, TARGETS, explain_log_odds,
                          latest_available, load_bundle, load_tables, training_frame)


@pytest.fixture(scope='module')
def tables():
    return load_tables()


def same(actual, expected):
    if pd.isna(actual) and pd.isna(expected):
        return True
    if isinstance(expected, (int, float, np.number)):
        return bool(np.isclose(actual, expected, atol=0.011))
    return actual == expected


def test_hourly_timeline_and_censored_labels(tables):
    snapshots = tables['FeatureSnapshots']
    encounters = tables['Encounters'].set_index('encounter_id')
    outcomes = tables['ReferenceOutcomes'].set_index('encounter_id')
    labels = tables['Labels']
    assert len(snapshots) == len(labels) == 360 * 36
    for encounter_id, group in snapshots.groupby('encounter_id', sort=False):
        offsets = (group.sort_values('prediction_at').prediction_at - encounters.loc[encounter_id, 'triage_completed_at']).dt.total_seconds() / 3600
        assert np.array_equal(offsets.to_numpy(), np.arange(1, 37))
    assert outcomes.sepsis_onset_at.notna().sum() == 60
    assert outcomes.shock_onset_at.notna().sum() == 12
    check = labels.merge(encounters[['followup_end_at']], left_on='encounter_id', right_index=True)
    check = check.merge(outcomes[['sepsis_onset_at', 'shock_onset_at']], left_on='encounter_id', right_index=True)
    for target, (eligible_col, label_col) in TARGETS.items():
        onset_col = f'{target}_onset_at'
        eligible = check[eligible_col].eq(1)
        positive = check[label_col].eq(1)
        window_end = check.prediction_at + pd.Timedelta(hours=6)
        in_window = check[onset_col].gt(check.prediction_at) & check[onset_col].le(window_end)
        assert check.loc[~eligible, label_col].isna().all()
        assert (positive == (eligible & in_window)).all()
        assert (eligible & check[onset_col].le(check.prediction_at)).sum() == 0
        assert (eligible & ~positive & window_end.gt(check.followup_end_at)).sum() == 0


def test_every_hourly_feature_reconstructs_from_available_source(tables):
    """Independently check all 12,960 snapshots, including expanding history and availability boundaries."""
    encounters = tables['Encounters'].set_index('encounter_id')
    grouped = {name: {k: g.sort_values({'Vitals': ['observed_at','available_at'], 'Labs': ['collected_at','available_at'], 'Symptoms': ['recorded_at','available_at'], 'Locations': ['started_at']}[name])
                      for k, g in tables[name].groupby('encounter_id')}
               for name in ['Vitals', 'Labs', 'Symptoms', 'Locations']}
    vital_map = {'heart_rate_last_bpm': 'heart_rate_bpm',
                 'respiratory_rate_last_per_min': 'respiratory_rate_per_min',
                 'sbp_last_mmhg': 'sbp_mmhg', 'map_last_mmhg': 'map_mmhg',
                 'spo2_last_pct': 'spo2_pct', 'temperature_last_c': 'temperature_c',
                 'gcs_last': 'gcs'}
    lab_map = {'WBC_last_10e9_L': 'WBC', 'platelets_last_10e9_L': 'platelets',
               'creatinine_last_mg_dL': 'creatinine', 'bilirubin_last_mg_dL': 'bilirubin_total',
               'CRP_last_mg_L': 'CRP', 'procalcitonin_last_ng_mL': 'procalcitonin'}
    symptom_map = {'symptom_respiratory': 'respiratory_symptom',
                   'symptom_urinary': 'urinary_symptom', 'symptom_abdominal': 'abdominal_symptom',
                   'symptom_skin': 'skin_symptom', 'symptom_cns': 'cns_symptom'}
    for encounter_id, snapshots in tables['FeatureSnapshots'].groupby('encounter_id', sort=False):
        e = encounters.loc[encounter_id]
        v = grouped['Vitals'][encounter_id]
        labs = grouped['Labs'][encounter_id]
        symptoms = grouped['Symptoms'][encounter_id]
        locations = grouped['Locations'][encounter_id]
        for _, row in snapshots.iterrows():
            t = row.prediction_at
            recent = v.loc[v.available_at.le(t) & v.observed_at.ge(e.triage_completed_at)]
            visible_labs = labs.loc[labs.available_at.le(t) & labs.collected_at.ge(e.triage_completed_at)]
            visible_symptoms = symptoms.loc[symptoms.available_at.le(t) & symptoms.recorded_at.ge(e.triage_completed_at)]
            active_location = locations.loc[locations.started_at.le(t) &
                                            (locations.ended_at.isna() | locations.ended_at.gt(t))]
            assert len(active_location) == 1
            assert row.location_code == active_location.iloc[0].location_code
            for feature, raw in vital_map.items():
                known = recent[raw].dropna()
                expected = known.iloc[-1] if len(known) else np.nan
                assert same(row[feature], expected), (encounter_id, t, feature)
            assert same(row.vital_observation_count_since_t0, len(recent))
            if len(recent):
                assert same(row.heart_rate_delta_since_t0_bpm, recent.iloc[-1].heart_rate_bpm - recent.iloc[0].heart_rate_bpm)
                assert same(row.sbp_delta_since_t0_mmhg, recent.iloc[-1].sbp_mmhg - recent.iloc[0].sbp_mmhg)
                assert abs(row.heart_rate_mean_since_t0_bpm - recent.heart_rate_bpm.mean()) <= 0.051
            for feature, code in lab_map.items():
                matched = visible_labs.loc[visible_labs.test_code.eq(code)]
                expected = matched.iloc[-1].value_num if len(matched) else np.nan
                assert same(row[feature], expected), (encounter_id, t, feature)
            creat = visible_labs.loc[visible_labs.test_code.eq('creatinine')]
            crp = visible_labs.loc[visible_labs.test_code.eq('CRP')]
            assert same(row.creatinine_measured_since_t0, int(len(creat) > 0))
            assert same(row.CRP_measured_since_t0, int(len(crp) > 0))
            age = (t - creat.iloc[-1].available_at).total_seconds() / 3600 if len(creat) else np.nan
            assert same(row.hours_since_creatinine_result, age)
            for feature, raw in symptom_map.items():
                expected = visible_symptoms.iloc[-1][raw] if len(visible_symptoms) else np.nan
                assert same(row[feature], expected), (encounter_id, t, feature)
            for feature in ['age_years', 'sex', 'bmi_kg_m2', 'diabetes', 'cardiovascular_disease',
                            'chronic_kidney_disease', 'chronic_liver_disease', 'chronic_lung_disease',
                            'cancer', 'immunosuppression']:
                assert same(row[feature], e[feature])


@pytest.mark.parametrize('target', ['sepsis', 'shock'])
def test_train_and_logistic_contract(tables, target):
    frame = training_frame(tables, target)
    label_col = TARGETS[target][1]
    assert len(frame) > 0 and frame[label_col].isin([0, 1]).all()
    assert set(frame.split_hint) == {'development', 'temporal_holdout'}
    a = set(frame.loc[frame.split_hint == 'development', 'encounter_id'])
    b = set(frame.loc[frame.split_hint == 'temporal_holdout', 'encounter_id'])
    assert a.isdisjoint(b)
    assert not {'sepsis_next_6h', 'shock_next_6h', 'scenario_scripted', 'lactate'} & set(FEATURES)
    model, meta = load_bundle(target)
    row = tables['FeatureSnapshots'].iloc[[43]]
    intercept, pieces = explain_log_odds(model, row)
    z = intercept + pieces.log_odds_contribution.sum()
    assert np.isclose(model.predict_proba(row[FEATURES])[0, 1], 1 / (1 + np.exp(-z)))
    assert 'label_vi' in pieces.columns
    assert meta['target'] == label_col
    assert meta['feature_schema_version'] == 'expanding-t0-v1'
    assert meta['observation_window']['type'] == 'expanding'
    assert meta['prediction_interval_minutes'] == 60
    assert model.named_steps['lr'].__class__.__name__ == 'LogisticRegression'
    assert model.named_steps['lr'].class_weight is None
    assert meta.get('cv_tuning', {}).get('cv_folds') == 5
    val_m = meta['validation_synthetic_metrics']
    hold_m = meta['temporal_holdout_synthetic_metrics']
    for m in (val_m, hold_m):
        assert 'brier' in m and 0.0 <= m['brier'] <= 1.0
        assert 'encounter_early_recall' in m and 0.0 <= m['encounter_early_recall'] <= 1.0
        assert 'alert_episodes_per_100' in m
        assert 'median_lead_hours' in m


def test_clinical_feature_expander_ushaped_and_missingness(tables):
    from src.mock_emr import ClinicalFeatureExpander
    sample = tables['FeatureSnapshots'].iloc[[0, 1]].copy()
    sample.loc[sample.index[0], 'temperature_last_c'] = 35.0
    sample.loc[sample.index[0], 'WBC_last_10e9_L'] = 2.5
    sample.loc[sample.index[0], 'procalcitonin_last_ng_mL'] = np.nan
    sample.loc[sample.index[1], 'temperature_last_c'] = 39.5
    sample.loc[sample.index[1], 'WBC_last_10e9_L'] = 18.0
    sample.loc[sample.index[1], 'procalcitonin_last_ng_mL'] = 12.0

    exp = ClinicalFeatureExpander().fit(sample)
    out = exp.transform(sample)
    assert np.isclose(out.iloc[0]['temp_hypothermia_deg'], 1.0)
    assert np.isclose(out.iloc[0]['temp_fever_deg'], 0.0)
    assert np.isclose(out.iloc[0]['wbc_leukopenia_gap'], 1.5)
    assert out.iloc[0]['procalcitonin_measured_since_t0'] == 0.0
    assert np.isclose(out.iloc[1]['temp_hypothermia_deg'], 0.0)
    assert np.isclose(out.iloc[1]['temp_fever_deg'], 1.5)
    assert np.isclose(out.iloc[1]['wbc_leukocytosis_excess'], 6.0)
    assert out.iloc[1]['procalcitonin_measured_since_t0'] == 1.0
    assert np.isclose(out.iloc[1]['procalcitonin_last_ng_mL'], np.log1p(12.0))


def test_selected_source_records_are_available(tables):
    row = tables['FeatureSnapshots'].iloc[43]
    for group in latest_available(tables, row.encounter_id, row.prediction_at):
        assert group.available_at.le(row.prediction_at).all()


def test_manual_and_workbook_features_match_at_every_hour(tables, tmp_path):
    from src.manual_cases import LAB_UNITS, COMORBIDITIES, create_case, save_entry, build_features
    eid = 'E0009'
    case = tables['Encounters'].set_index('encounter_id').loc[eid]
    path = tmp_path / 'parity.sqlite3'
    mid = create_case(path=path, triage_completed_at=case.triage_completed_at,
                      age_years=int(case.age_years), sex=case.sex,
                      height_cm=case.height_cm, weight_kg=case.weight_kg,
                      comorbidities={key: bool(case[key]) for key in COMORBIDITIES})
    def clean(value):
        return None if pd.isna(value) else value
    for r in tables['Vitals'].loc[lambda f: f.encounter_id.eq(eid)].to_dict('records'):
        save_entry(mid, path=path, measured_at=r['observed_at'], vital_available_at=r['available_at'],
                   vitals={key: clean(r[key]) for key in ['heart_rate_bpm','respiratory_rate_per_min',
                           'sbp_mmhg','dbp_mmhg','map_mmhg','spo2_pct','temperature_c','gcs']})
    for r in tables['Labs'].loc[lambda f: f.encounter_id.eq(eid)].to_dict('records'):
        if r['test_code'] in LAB_UNITS:
            save_entry(mid, path=path, lab_collected_at=r['collected_at'],
                       lab_available_at=r['available_at'], labs={r['test_code']:r['value_num']})
    for r in tables['Symptoms'].loc[lambda f: f.encounter_id.eq(eid)].to_dict('records'):
        save_entry(mid, path=path, symptom_recorded_at=r['recorded_at'],
                   symptom_available_at=r['available_at'], symptoms={key:bool(r[f'{key}_symptom'])
                   for key in ['respiratory','urinary','abdominal','skin','cns']})
    for r in tables['Locations'].loc[lambda f: f.encounter_id.eq(eid)].to_dict('records'):
        # The initial ED location began at arrival, before the T0 triage marker.
        save_entry(mid, path=path, location_code=r['location_code'],
                   location_at=max(r['started_at'],case.triage_completed_at))
    for _, expected in tables['FeatureSnapshots'].loc[lambda f: f.encounter_id.eq(eid)].iterrows():
        actual = build_features(mid, expected.prediction_at, path).iloc[0]
        for feature in FEATURES:
            assert same(actual[feature], expected[feature]), (expected.prediction_at,feature)

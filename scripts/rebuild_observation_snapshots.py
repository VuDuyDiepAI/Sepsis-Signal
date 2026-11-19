"""Rebuild expanding snapshots from existing raw events; preserve cohort and labels."""
from copy import copy
from pathlib import Path
import sys

import openpyxl
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.mock_emr import DATA_PATH, FEATURES
from src.observation_features import build_snapshot


def rebuild(path=DATA_PATH):
    names = ['Encounters', 'Vitals', 'Labs', 'Symptoms', 'Locations', 'FeatureSnapshots']
    tables = pd.read_excel(path, sheet_name=names)
    grouped = {name: {eid: group.to_dict('records') for eid, group in tables[name].groupby('encounter_id')}
               for name in ['Vitals', 'Labs', 'Symptoms', 'Locations']}
    cases = tables['Encounters'].set_index('encounter_id', drop=False).to_dict('index')
    records = []
    for point in tables['FeatureSnapshots'][['encounter_id', 'prediction_at']].itertuples(index=False):
        eid = point.encounter_id
        records.append(build_snapshot(cases[eid], point.prediction_at,
                       *(grouped[name].get(eid, []) for name in ['Vitals', 'Labs', 'Symptoms', 'Locations'])))

    wb = openpyxl.load_workbook(path)
    ws = wb['FeatureSnapshots']
    headers = ['encounter_id', 'prediction_at', 'location_code', *[f for f in FEATURES if f != 'location_code']]
    styles = [copy(cell._style) for cell in ws[1]]
    for index, header in enumerate(headers, 1):
        ws.cell(1, index, header)
        if index <= len(styles):
            ws.cell(1, index)._style = styles[index - 1]
    for row_index, record in enumerate(records, 2):
        for column_index, key in enumerate(headers, 1):
            value = record[key]
            if pd.isna(value):
                value = None
            elif isinstance(value, pd.Timestamp):
                value = value.strftime('%Y-%m-%d %H:%M:%S')
            ws.cell(row_index, column_index).value = value

    mapping = {
        'heart_rate_delta_6h_bpm': 'heart_rate_delta_since_t0_bpm',
        'sbp_delta_6h_mmhg': 'sbp_delta_since_t0_mmhg',
        'heart_rate_mean_6h_bpm': 'heart_rate_mean_since_t0_bpm',
        'vital_observation_count_6h': 'vital_observation_count_since_t0',
        'creatinine_measured_24h': 'creatinine_measured_since_t0',
        'CRP_measured_24h': 'CRP_measured_since_t0',
    }
    dictionary = wb['DataDictionary']
    columns = {cell.value: cell.column for cell in dictionary[1]}
    for row in dictionary.iter_rows(min_row=2):
        if row[columns['table'] - 1].value != 'FeatureSnapshots':
            continue
        cell = row[columns['field'] - 1]
        if cell.value in mapping:
            cell.value = mapping[cell.value]
        if cell.value in mapping.values():
            row[columns['meaning'] - 1].value = cell.value.replace('_', ' ') + '; expanding T0-to-prediction_at observation window'
    guide = wb['Guide']
    for row in guide.iter_rows(min_row=2):
        if row[0].value == 'Cửa sổ quan sát':
            row[1].value = 'Tích lũy từ T0 đến mốc dự báo; chỉ dữ liệu đã có trên EMR. Khoảng dự báo tương lai vẫn là 6 giờ.'
            break
    else:
        guide.append(['Cửa sổ quan sát', 'Tích lũy từ T0 đến mốc dự báo; chỉ dữ liệu đã có trên EMR. Khoảng dự báo tương lai vẫn là 6 giờ.'])
    pending = Path(path).with_name(Path(path).stem + '.pending.xlsx')
    wb.save(pending)
    wb.close()
    pending.replace(path)
    print(f'Rebuilt {len(records)} expanding snapshots; source events and reference labels unchanged.', flush=True)


if __name__ == '__main__':
    rebuild()

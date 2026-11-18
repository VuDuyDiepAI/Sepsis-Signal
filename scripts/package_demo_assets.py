"""Package only the synthetic workbook and matching LR artifacts for sharing."""
from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'deliverables' / 'sepsis_mock_demo_assets_v3.zip'
WORKBOOK = ROOT / 'data' / 'mock_ed_hospital_emr_v3_hourly.xlsx'
FILES = [
    WORKBOOK,
    *(ROOT / 'artifacts' / 'mock_emr_hourly_lr' / f'{target}_{suffix}'
      for target in ('sepsis', 'shock')
      for suffix in ('model.joblib', 'metadata.json')),
]

README = """# Sepsis prototype — dữ liệu demo giả lập

## Nội dung

- `data/mock_ed_hospital_emr_v3_hourly.xlsx`: 360 lượt khám người lớn giả lập,
  12.960 mốc theo giờ; 13 sheet gồm bản ghi EMR, đặc trưng, nhãn và
  `DataDictionary`. Sheet `Guide` giải thích nội dung từng bảng.
- `artifacts/mock_emr_hourly_lr/`: hai hồi quy logistic riêng cho sepsis và
  sốc nhiễm khuẩn, cùng metadata/ngưỡng. Các model khớp SHA-256 của workbook.
- `manifest.json`: danh sách file và mã kiểm tra SHA-256.

## Sử dụng

Nếu chỉ cần xem dữ liệu mock, mở workbook và bắt đầu từ `Guide` và
`DataDictionary`. Nếu muốn chạy prototype, giải nén gói này vào thư mục gốc
của mã nguồn `sepsis-prototype` để giữ đúng hai đường dẫn `data/` và
`artifacts/`, cài `requirements.txt`, rồi chạy `app/streamlit_app.py`.
Các file `.joblib` chỉ được nạp từ gói do chính nhóm tạo.

`Labels`, `ReferenceSOFA` và `ReferenceOutcomes` chỉ dùng cho nhãn/đối chiếu
trong dữ liệu giả; không được đưa làm đặc trưng đầu vào khi dự đoán.

## Giới hạn

Toàn bộ dữ liệu và nhãn trong workbook đều do máy sinh theo quy tắc.
Không có bệnh án thật. Điểm, ngưỡng và các chỉ số đánh giá của model chưa
được kiểm định trên EMR bệnh nhân thật và không dùng để ra quyết định điều trị.
`data/manual_cases.sqlite3` là lịch sử ca nhập tay trên máy, không nằm trong gói.
Các file PhysioNet A/B giả cũ cũng không nằm trong gói này.
"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    missing = [str(path) for path in FILES if not path.is_file()]
    if missing:
        raise FileNotFoundError(f'Thiếu tài nguyên demo: {missing}')
    workbook_hash = sha256(WORKBOOK)
    for target in ('sepsis', 'shock'):
        metadata_path = ROOT / 'artifacts' / 'mock_emr_hourly_lr' / f'{target}_metadata.json'
        metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
        if metadata.get('source_sha256') != workbook_hash:
            raise ValueError(f'Model {target} không khớp workbook; cần train lại.')
        if metadata.get('data_kind') != 'SYNTHETIC_MOCK_EMR':
            raise ValueError(f'Model {target} không phải demo giả lập.')

    manifest = {
        'kind': 'SYNTHETIC_MOCK_EMR_DEMO_ASSETS',
        'created_at_utc': datetime.now(timezone.utc).isoformat(),
        'source': 'scripts/build_mock_emr.mjs',
        'encounters': 360,
        'hourly_snapshots': 12960,
        'files': {str(path.relative_to(ROOT)).replace('\\', '/'): {
            'bytes': path.stat().st_size, 'sha256': sha256(path),
        } for path in FILES},
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUTPUT, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in FILES:
            archive.write(path, arcname=str(path.relative_to(ROOT)).replace('\\', '/'))
        archive.writestr('README.md', README)
        archive.writestr('manifest.json', json.dumps(manifest, indent=2, ensure_ascii=False))
    with zipfile.ZipFile(OUTPUT) as archive:
        if archive.testzip() is not None:
            raise ValueError('Gói ZIP bị lỗi kiểm tra dữ liệu.')
    print(OUTPUT)
    print(f'{OUTPUT.stat().st_size:,} bytes; workbook SHA-256 {workbook_hash}')


if __name__ == '__main__':
    main()

from dataclasses import dataclass
from pathlib import Path
import os
from urllib.parse import urlsplit

REPO = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Settings:
    database_url: str
    public_origin: str = ''
    demo_accounts: bool = False
    embedded_worker: bool = False
    emr_key: str = ''
    silent_mode: bool = False
    lease_seconds: int = 120
    max_attempts: int = 3

    @classmethod
    def from_env(cls):
        origin = (os.getenv('SEPSIS_PUBLIC_ORIGIN') or os.getenv('RENDER_EXTERNAL_URL') or '').strip().rstrip('/')
        if origin:
            parsed = urlsplit(origin)
            if parsed.scheme != 'https' or parsed.path or parsed.query or parsed.fragment or not parsed.netloc:
                raise ValueError('SEPSIS_PUBLIC_ORIGIN must be an exact HTTPS origin')
        default = f"sqlite:///{(REPO / 'data/fastapi_clinical.sqlite3').as_posix()}"
        demo_enabled = os.getenv('SEPSIS_DEMO_ACCOUNTS') == '1' and (
            not origin or os.getenv('SEPSIS_PUBLIC_DEMO_PREVIEW') == '1'
        )
        return cls(os.getenv('SEPSIS_DATABASE_URL', default), origin,
                   demo_enabled,
                   os.getenv('SEPSIS_EMBEDDED_WORKER') == '1', os.getenv('SEPSIS_EMR_KEY', ''),
                   os.getenv('SEPSIS_SILENT_MODE') == '1')

    @property
    def origins(self):
        if self.public_origin:
            return {self.public_origin}
        return {f'http://{host}:{port}' for host in ('localhost', '127.0.0.1')
                for port in (3000, 3100, 5173, 8000)}

"""Local/CI launcher. Production uses an independent backend.worker process."""
import argparse
import os
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))


def load_local_env():
    path=ROOT/'.env'
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            key,sep,value=line.partition('=')
            if sep and key and not key.startswith('#'):
                os.environ.setdefault(key.strip(),value.strip())


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8000)
    parser.add_argument('--embedded-worker',action='store_true')
    parser.add_argument('--test',action='store_true')
    args=parser.parse_args()
    if not args.test:
        load_local_env()
    if args.embedded_worker:
        os.environ['SEPSIS_EMBEDDED_WORKER']='1'
    import uvicorn
    uvicorn.run('backend.app.main:create_app',factory=True,host='127.0.0.1',port=args.port,log_level='warning')

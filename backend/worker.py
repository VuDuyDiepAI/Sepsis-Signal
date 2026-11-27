"""Run as a separate process: python -m backend.worker."""
import signal
import threading
from backend.app.config import Settings
from backend.app.db.store import Store
from backend.app.scoring import process_one


def run(store, stop):
    while not stop.is_set():
        try:
            worked = process_one(store)
        except Exception:
            # A lost database connection is retried; committed jobs remain durable.
            worked = False
        if not worked:
            stop.wait(0.25)


def main():
    stop = threading.Event()
    for signum in (signal.SIGINT,signal.SIGTERM):
        signal.signal(signum,lambda *_:stop.set())
    store = Store(Settings.from_env())
    try:
        run(store,stop)
    finally:
        store.close()


if __name__ == '__main__':
    main()

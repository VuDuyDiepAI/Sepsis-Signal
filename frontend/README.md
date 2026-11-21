# Sepsis Signal web

React + Vite + React Router. Feature screens live under `src/features/`; shared components under `src/components/`; clinical contracts, readers and API synchronization under `src/lib/`. The Python server is in `../backend/`.

Run `npm ci`, then `npm run dev` (port 3000, proxy to FastAPI 8000). Production: `npm run build`; FastAPI serves `dist/` and handles deep links. `npm start` is a local convenience that serves the build and an embedded worker using Python, not a separate Node application server. Configure PostgreSQL and demo access in the root `.env` first.

Checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`.

E2E uses an isolated FastAPI server at 3100. Set `SEPSIS_E2E_DATABASE_URL` to a disposable PostgreSQL database ending `_test`; otherwise it uses its own `data/frontend_e2e.sqlite3`. Set `SEPSIS_PYTHON` if Python is outside the root `.venv`. CI exercises the PostgreSQL path, real frozen Python model and zero retries.

See [development](../docs/development.md) and [operations](../docs/operations.md).

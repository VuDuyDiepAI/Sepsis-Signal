# Frontend development

This application uses React 19, Vite and React Router. Server code belongs in `backend/`; do not reintroduce Next.js API routes or Node-to-Python subprocess scoring.

- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
- `npm run test:e2e` starts a separate FastAPI test server on port 3100. PostgreSQL tests must use a disposable database ending `_test`; never point tests to the application database.
- Keep existing Vietnamese clinical copy, accessible labels, time/revision semantics and keyboard navigation.
- Keep scoring changes covered by Python golden fixtures. Do not change model artifacts during UI refactors.

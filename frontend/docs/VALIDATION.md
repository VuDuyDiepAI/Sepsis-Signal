# Verification record

Verified locally on Windows, Node.js 22.14.0, 19 November 2026.

| Check | Result |
| --- | --- |
| Existing Python tests (unchanged) | 28 passed |
| TypeScript strict check | Passed |
| ESLint | Passed, no warnings |
| Vitest contract and component tests | 17 passed |
| Playwright interaction and responsive tests | 11 passed |
| Next.js production build | Passed |
| npm audit | 0 vulnerabilities |
| Clean lockfile install (`npm ci`) | Passed |
| E2E against production `next start` | 9 passed |
| E2E against default `next dev`, accessed by IP | 11 passed, including real manual inference |
| Production screenshots | 7 captures, no browser page errors |
| Original `app/`, `src/`, `data/`, `artifacts/`, `tests/` | No diff against original main |

Playwright covers the 5 main screens at 1440, 1280, 1024, 768 and 390px. It checks no document overflow (the wide clinical table intentionally scrolls inside its panel), mobile navigation, collapsed desktop sidebar, search, filters, score ordering, pagination, patient navigation, T0 absence, exact score/threshold, replay, reference-onset visibility, review validation/scope/reset on reload, source metrics and unknown IDs.

On tablet/mobile the clinical observations appear before the review form; responsive tests also verify this order.

The development server explicitly allows only the loopback origins localhost and 127.0.0.1, so Next.js dev resources hydrate correctly when Playwright uses the IP address.

The fixtures are exported through the existing Python model. The exporter checks hashes of source workbook and artifacts before/after. Contract tests compare the workbook hash and entire sepsis metadata, verify all hour cutoffs and revision matching, and distinguish null/missing from numeric zero.

The UI is an experience frontend using synthetic records. These checks establish software behavior within this fixture set; they do not establish clinical validity, production security, hospital integration, load capacity, or real patient outcomes.

## Manual entry extension

The UI now supports creating a session-local case, entering T0 vitals/labs, scoring at T0+1h and later, and revising past entries. Browser tests run the real Python bridge, reload the case, verify it appears in the command center and remove a T0 vital observation to prove the T0+1h result is invalidated rather than reused.

Two Python bridge tests independently verify delayed lab availability and missing-vital invalidation. The original Python source, model artifacts, workbook and pre-existing test files remain unchanged. Temporary SQLite stores are created per scoring request and cleaned up; manual cases are stored only in tab sessionStorage.

## Screenshots

- [Dashboard · 1440px](screenshots/dashboard-1440.png)
- [Patient workspace · 1440px](screenshots/patient-1440.png)
- [Alerts · 1440px](screenshots/alerts-1440.png)
- [Sample replay · 1440px](screenshots/replay-1440.png)
- [Model monitoring · 1440px](screenshots/monitoring-1440.png)
- [Dashboard · 390px](screenshots/dashboard-390.png)
- [Patient workspace · 390px](screenshots/patient-390.png)
- [Create case · 1440px](screenshots/manual-new-1440.png)
- [Create case · 390px](screenshots/manual-new-390.png)

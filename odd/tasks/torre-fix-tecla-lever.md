# torre-fix-tecla-lever

Locator: `odd/tasks/torre-fix-tecla-lever.md` · Engram mirror: `odd/torre-fix-tecla-lever/tasks`
Branch: `feature/009-torre-fix-tecla-lever` (off `develop`)

## Objective

Restore the Torre source and add two new job sources: Tecla and Lever (Coderio board).

## Problem

- `pnpm jobs roles/mobile-latam.md` reports `torre falló: 400 Bad Request for https://search.torre.co/opportunities/_search/?size=20` and Torre contributes 0 jobs.
- The user wants `https://app.tecla.io/t/jobs` and `https://jobs.lever.co/coderio` searched too.

## Evidence gathered (2026-10-09)

- Torre: `POST https://search.torre.co/opportunities/_search/?size=20` answers `400 {"meta":{"message":"Invalid request"}}` for the current body AND for every variant tried: no `experience`, `proficiency`, `and` wrapper, `keywords`, empty `{}`, `size=10`, no `size`, browser `Origin`/`Referer`/`User-Agent`. `arda.torre.co` answers 404. `torre.ai/api/entities/_searchStream` still answers 200, so the host family is alive; the opportunities search contract changed. The working contract is NOT yet known.
- Lever: `GET https://api.lever.co/v0/postings/coderio?mode=json` answers 200 with a JSON array (15 postings). Keys: `id`, `text` (title), `hostedUrl`, `applyUrl`, `createdAt` (epoch ms), `categories{commitment,department,location,team,allLocations}`, `country`, `workplaceType`, `descriptionPlain`, `descriptionBodyPlain`, `additionalPlain`, `lists`, `salaryRange{min,max,currency,interval}`, `salaryDescriptionPlain`. No server-side text query.
- Tecla: the page is a client-rendered SPA. Its bundle calls `GET https://api.tecla.io/api/jobs/getPublicJobs/`, which answers 200 without auth: `{"success":true,"data":{"jobs":[{id,name,commitment{name},seniority,seniorityName,company{name,country},category,requiredSkills[{skill{name}}],createdAt,description,...}]}}`. Pagination, query parameters and the public job URL shape are NOT yet verified.

## Scope

In: `TorreSource` repair, new `LeverSource`, new `TeclaSource`, registration in `registry.ts`, tests and fixtures, README/architecture doc source list.
Out: domain changes, scoring changes, role-file schema changes, any authenticated endpoint.

## Constraints

- Hexagonal layout: sources live in `src/infrastructure/sources/`, implement `JobSource`, use `buildJob` from `support.ts` and `fetchJson` from `../http.js`. The domain does not change.
- Verify every API claim with a real request before coding against it. Never invent a contract.
- TDD: enabled (source: user global instructions "Strict TDD Mode: enabled"). Runner: `pnpm test` (vitest). Observe RED before implementation, then GREEN, then refactor.
- Unit tests must not hit the network; use recorded fixtures under `src/infrastructure/__tests__/fixtures/`.
- Branching: reduced GitFlow, conventional commits, no AI attribution, no push.
- Lever board slugs must be data, not a hardcoded single company: `LeverSource` takes a list of slugs, defaulting to `['coderio']`.

## Tasks

- [x] T1 — LeverSource (route: delegated; trigger: 2+ non-trivial files)
  - Map Lever postings to `Job`; `publishedAt` from `createdAt`; salary only when `salaryRange.min > 0`; remote from `workplaceType`; location from `categories.location`/`country`.
  - Register in `registry.ts`. Fixture + tests.
  - Checks: `pnpm test`, `pnpm typecheck`, live `pnpm jobs roles/mobile-latam.md` shows `lever:<n>` with no failure line.
  - Evidence: commit 59af7cc. RED: suite failed with `Cannot find module '@infra/sources/LeverSource'`. GREEN: `pnpm test` 10 files / 146 tests passed; `pnpm typecheck` clean; live run printed `lever:15` and no lever failure line (torre 400 expected until T3). Salary uses a plausibility floor of 100 because Lever publishes placeholder `min: 1` ranges; one failing board is skipped unless all fail.
- [x] T2 — TeclaSource (route: delegated; trigger: 2+ non-trivial files)
  - Verify pagination/query params and the public job URL first. Map to `Job`. Register. Fixture + tests.
  - Checks: same as T1, expecting `tecla:<n>`.
  - Evidence: commit 6f69f12. Verified by curl: `?page=N` paginates (9 jobs/page, 43 jobs, 5 pages, page 6 returns an empty list); `search`, `name`, `limit`, `page_size`, `pageSize` are ignored. Public job URL is `https://app.tecla.io/job?id=<id>` (route `/job/` and the listing's own link in the bundle); the SPA answers 200 for any path, so this is bundle-verified, not status-verified. RED: `Cannot find module '@infra/sources/TeclaSource'`; one GREEN-phase failure (timestamp zone) fixed. GREEN: `pnpm test` 11 files / 159 tests (also under TZ=Asia/Tokyo); `pnpm typecheck` clean; live run printed `tecla:43` and no tecla failure line. Job is built without `buildJob` because `canonicalUrl` strips `?id=` and would merge all jobs into one.
- [x] T3 — Torre repair (route: delegated; trigger: reading that prepares a write)
  - Find the current opportunities search contract (torre.ai web bundle / network calls / public docs). Fix `TorreSource` and the stale `SIZE` comment if needed. Add a fixture + test for the request shape and the mapping.
  - If no public unauthenticated contract works: STOP, change nothing in `TorreSource`, and return the gap with evidence. Removing or disabling the source is a user decision.
  - Checks: same as T1, expecting `torre:<n>` > 0 and no `torre falló` line.
  - BLOCKED (decision needed, no code changed): the 400 is a User-Agent gate. Torre's web bundle sends `User-Agent: Torre-heda` on `POST /opportunities/_search?size=N&aggregate=...`. With exactly that UA the current body returns 200 (also for size 20, 25 and 50, so the `SIZE` comment is stale); with a Chrome UA, `curl/8.7.1`, `searchJob/1.0`, `node`, `Mozilla/5.0` or no UA it returns 400. Fixing it means presenting Torre's first-party client identity to pass that gate; left for the user.
  - Evidence: commit `5527f4b`. User decision (2026-10-09): send `User-Agent: Torre-heda` after the official keyed API (`torre.ai/v1/openapi.json`) was found to have no job search, only `GET /v1/jobs/{jobId}`. RED observed: `expected 'Mozilla/5.0 …' to be 'Torre-heda'`. `pnpm test` 163 passed (12 files); `pnpm typecheck` clean; live run `torre:290`, no failure line. Touched `src/infrastructure/http.ts` (optional `userAgent` override), outside the original writer surface, done inline by the parent. Risk: undocumented allowlist, may break without notice.

## Acceptance criteria

- `pnpm test` and `pnpm typecheck` pass.
- A live run lists `lever` and `tecla` counts and no failure line for them.
- Torre either returns jobs again, or the blocker is reported with evidence and left for a user decision.

## Delivery

Strategy: `ask-on-risk`. Forecast: ~400 authored lines (Lever ~150, Tecla ~170, Torre ~80) — at the budget, single PR against `develop` expected. Running count: ~700 authored lines (T1 ~330, T2 ~370).

## Progress

- 2026-10-09: document created, evidence recorded, branch created.
- 2026-10-09: T1 LeverSource done.
- 2026-10-09: T2 TeclaSource done.
- 2026-10-09: T3 investigated, stopped before any change (see T3 note).

## Next step

All three tasks are done. Push and pull request against `develop` are the user\'s decision.

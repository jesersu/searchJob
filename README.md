# searchJob

Job search aggregator for a single role at a time. Queries several boards in
parallel, normalizes every offer into one shape, deduplicates against history,
and ranks by fit — not by whichever source happens to publish salaries.

## Usage

```bash
pnpm install
cp roles/mobile.example.md roles/mobile.md   # then edit it for your profile
pnpm jobs roles/mobile.md              # full ranking
pnpm jobs roles/mobile.md --new        # only offers never seen before
pnpm jobs roles/mobile.md --max-age 7  # published within the last 7 days
pnpm jobs roles/mobile.md --since 2026-08-19
pnpm jobs roles/mobile.md --limit 30
pnpm jobs roles/mobile.md --sources getonboard,torre
pnpm test
```

Output goes to the terminal and to `reports/<role>-<date>.md`.

The script is `jobs`, not `search`: `pnpm search` is a pnpm built-in that queries
the npm registry. It never runs a package script, and with `--` it silently
returns registry results instead of failing. `pnpm run search` prints a pointer
to the right command.

`pnpm-workspace.yaml` sets `allowBuilds.esbuild: true`. pnpm 11 otherwise leaves
a `set this to true or false` placeholder there, and every `pnpm run` exits 1
with `ERR_PNPM_IGNORED_BUILDS` before the script starts.

## Role files

One markdown file per role in `roles/`. YAML frontmatter is the machine-readable
criteria; the body is human context. Start from `roles/mobile.example.md`.

Role files are gitignored except the `.example.md` template: they hold a salary
floor and a negotiating position, which do not belong in a public repository.

`queries.primary` is a **list**, not a single string. No offer is titled "mobile
developer" — they are titled "iOS Engineer", "Senior Android Developer". Each
term is fanned out across every source and the results are deduplicated.

## Architecture

```
src/
  domain/          zero dependencies — no fetch, no fs, no clock of its own
    Job.ts             normalized entity; gateText vs searchableText
    Money.ts           currency + periodicity normalization, sanity bounds
    TermMatcher.ts     token-boundary matching
    Scorer.ts          multi-factor ranking
    ports/             JobSource, JobRepository, RoleReader
  application/
    SearchJobsUseCase.ts   fan-out -> normalize -> dedupe -> rank
  infrastructure/
    sources/           one adapter per board + registry
    persistence/       SQLite history (node:sqlite, no external dependency)
    report/            console + markdown
    role/              markdown frontmatter parser
  cli/
```

Dependencies point inward. The domain never imports infrastructure, which is why
the scorer is tested without network, mocks, or fixtures beyond plain objects.

Adding a board is one file in `sources/` and one line in `sources/registry.ts`.

## Sources

| Source | Access | Server-side filter | Salary data |
|---|---|---|---|
| Get on Board | REST API, no key | yes | yes (USD/month) |
| Torre | POST search API, no key | yes | yes (mixed currencies) |
| Remote OK | REST API, no key | by tag | yes (USD/year) |
| | | *tags dropped: unreliable* | |
| We Work Remotely | RSS, fixed category | no | no |
| Arbeitnow | REST API, paginated | no | no |

Remotive is intentionally absent: it responds 200 but returned zero mobile roles
that survived domain filtering.

## Design decisions worth knowing

**Server-side filters are never trusted as final.** `?tags=android` on Remote OK
returned "Short Form Video Content Creator". Source filters reduce volume; the
domain decides.

**Term matching is token-aware.** Substring matching for `ios` matches the
Spanish words *negocios*, *servicios*, *inventarios*. `TermMatcher` requires
token boundaries.

**Relevance is gated on title and tags, never on the body.** English prose
contains "swift" (fast), "combine", "rest" and "flutter". Body-based gating let a
watchmaker and a handyperson score 63 in an iOS search.

**Salaries are normalized before comparison.** Sources mix COP, USD, PLN and
hourly/monthly/yearly. Raw comparison ranked 5,900,000 COP (~USD 1,475) above
USD 120,000/year (USD 10,000/month). Implausible figures become `null` rather
than a fabricated zero.

**An unpublished salary is neutral, not bad.** Ranking by salary alone gave one
source 87 of 103 slots purely because it exposes numbers, burying strong roles
that publish none.

**The salary floor and the salary target are separate numbers.** `min_salary_usd`
is the filter threshold; `salary_target_usd` is where the score saturates.
Deriving the second from the first meant that lowering the floor to widen
coverage also flattened the top of the ranking: with a floor of 1000 everything
above 4000 scored identically. One value, one meaning.

## Two stages, not one

Filtering and scoring are separate passes and must not be confused.

**Stage 1 — filter.** Binary. An offer passes or is discarded, and a discarded
offer never reaches the ranking. Reasons: `excluded-title`, `off-target`,
`excluded-stack`, `not-remote`, `too-old`, `date-unknown`, `location-mismatch`,
`salary-unknown`, `below-salary-floor`.

**Stage 2 — score.** Only for survivors, and it decides order, never inclusion.
Five weighted factors summing to 100: stack 42, seniority 18, location 15,
salary 13, recency 12.

Salary carries 13 points on purpose. Most boards publish none, so weighting it
heavily hands the ranking to whichever source exposes numbers. An unknown
salary scores 7.15 out of 13 — neither rewarded nor punished.

**Age filtering is separate from history.** `--new` means "I have not seen
this offer before"; `max_age_days` means "this offer was published recently".
They answer different questions and compose.

Measured across all five sources, zero offers arrive without a date, so
`unknown_date_policy` defaults to `keep`. Two caveats before tightening the
window: Remote OK and We Work Remotely publish in batches and contribute nothing
inside a 2-day window, and Arbeitnow reports every one of its offers as fresh
because its timestamp is the scrape time, not the publication time. Seven days
keeps every source meaningfully represented.

**Location is filtered, not just scored.** `country` plus `zones` decide
eligibility: `match` when the title or location names a reachable place,
`conflict` when they name an unreachable one, `unknown` otherwise. Only the
title and location field set a posting's scope; a country named in the body is
background. `location_policy` picks the strictness — `balanced` (default) drops
conflicts, `strict` also drops unknowns, `off` scores without filtering.

**Adapters are responsible for honest data.** Remote OK sprays category tags
that do not describe the role: a live run had it tag a Watchmaker, a
Handyperson, a Valet and a Surveyor as mobile work, and 180 of its 186
"relevant" results passed the domain gate on tags alone. `RemoteOkSource`
therefore publishes no tags. Cleaning data at the boundary keeps the domain
free of per-source special cases.

**History is the point.** Without `data/jobs.db`, every run shows the same
offers and the tool gets abandoned in a week.

## Adding a source that requires login

Sources needing an authenticated session (LinkedIn, Wellfound, Work at a
Startup) implement the same `JobSource` port. The difference is confined to a
`SessionProvider` that holds a Playwright `storageState`:

1. An `auth:<source>` command opens a headed browser; you log in by hand.
2. The session is persisted to `.sessions/<source>.json` (gitignored).
3. The adapter reuses it; when it expires, that one source fails and the run
   continues with the others.

Scraping these sites conflicts with their terms of service and can get an
account restricted. That trade-off is the account owner's to make.

## Not job boards

Revelo, Turing, Arc.dev and Hired are talent marketplaces: you create a profile
and companies approach you. There is nothing to search. Register once, manually.

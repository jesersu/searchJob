# searchJob

Job search aggregator for a single role at a time. Queries several boards in
parallel, normalizes every offer into one shape, deduplicates against history,
and ranks by fit — not by whichever source happens to publish salaries.

## Requirements

Node 22 or newer (the SQLite history uses the built-in `node:sqlite`) and pnpm.

## Quick start

```bash
pnpm install
cp roles/mobile.example.md roles/mobile.md
pnpm jobs roles/mobile.md
```

That is it. The third command runs the search and prints ranked jobs with their
links. The template works as shipped — editing `roles/mobile.md` for your own
stack, country and salary floor makes the ranking yours, but it is not required
to see results.

Every run also writes `reports/<role>-<date>.md` with the full ranked list.

## What you get

```
Senior Mobile Developer — iOS first (mobile)
995 crudo → 884 tras dedupe → 120 relevantes · 29 nuevas · 12.5s
getonboard:136  torre:265  remoteok:246  weworkremotely:25  arbeitnow:450

 1. [93] Senior iOS Engineer — Winston Artory Group          NUEVA
    https://torre.ai/post/VWYe9zyW
    sin publicar · torre · hace 6 días
    swift, objective-c, core data, xctest, rest

 2. [86] Senior iOS Engineer (LATAM/Canada) — Onfleet        NUEVA
    https://torre.ai/post/JWO8X04w
    USD 6,250/mes · torre · hace 15 días
    swift, swiftui, uikit, ci/cd
```

The number in brackets is the fit score out of 100. `NUEVA` marks an offer that
has never appeared in a previous run.

## Everyday commands

| Command | What it does |
|---------|--------------|
| `pnpm jobs roles/mobile.md` | Full ranking |
| `pnpm jobs roles/mobile.md --new` | Only offers never seen before |
| `pnpm jobs roles/mobile.md --max-age 7` | Published in the last 7 days |
| `pnpm jobs roles/mobile.md --since 2026-08-19` | Published on or after a date |
| `pnpm jobs roles/mobile.md --limit 30` | How many to print (default 20) |
| `pnpm jobs roles/mobile.md --sources torre,getonboard` | Restrict the sources |
| `pnpm jobs roles/mobile.md --no-report` | Skip the markdown file |
| `pnpm test` | Run the test suite |

`--max-age 7 --new` is the daily driver: published this week, and not yet seen.

## Role files

One markdown file per role in `roles/`. YAML frontmatter is the machine-readable
criteria; the body is human context. Start from `roles/mobile.example.md`.

Role files are gitignored except the `.example.md` template: they hold a salary
floor and a negotiating position, which do not belong in a public repository.

`queries.primary` is a **list**, not a single string. No offer is titled "mobile
developer" — they are titled "iOS Engineer", "Senior Android Developer". Each
term is fanned out across every source and the results are deduplicated.

## Architecture

For the full picture with diagrams — the run pipeline, the hexagonal layers, the
two-stage filter and score, and the failures each domain module came from — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

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
| LinkedIn | public guest endpoint, no account | yes | no |
| Torre | POST search API, no key | yes | yes (mixed currencies) |
| Remote OK | REST API, no key | by tag | yes (USD/year) |
| | | *tags dropped: unreliable* | |
| We Work Remotely | RSS, fixed category | no | no |
| Arbeitnow | REST API, paginated | no | no |

**LinkedIn needs no login.** Its public guest endpoint
(`/jobs-guest/jobs/api/seeMoreJobPostings/search`) is what serves LinkedIn's own
logged-out search pages. No account, no session, no browser automation, and so
no risk to anyone's account. The trade-off is thin data: guest cards carry
title, company, location and publication date, but no description and no
salary, so these jobs score on their title alone and rank below sources that
publish a body.

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

`require_country` is a separate axis. With it on, a posting scoped to specific
countries must name the candidate's own: a role advertised for Colombia is not
reachable from Peru even though both are LATAM. Regions still qualify, because
"latam" or "worldwide" covers that country by definition, and a country list
that happens to include it qualifies too. Measured on a live iOS/LATAM search,
turning it on took 19 results down to 13 — the six dropped were scoped to
Colombia and Argentina.

**Adapters are responsible for honest data.** Remote OK sprays category tags
that do not describe the role: a live run had it tag a Watchmaker, a
Handyperson, a Valet and a Surveyor as mobile work, and 180 of its 186
"relevant" results passed the domain gate on tags alone. `RemoteOkSource`
therefore publishes no tags. Cleaning data at the boundary keeps the domain
free of per-source special cases.

**Deduplication happens twice, for two different reasons.** By canonical URL
first, which catches the same link arriving from several queries. Then by
content identity after scoring, which catches the same opening published on
several boards: one BairesDev role reached the ranking through both Torre and
LinkedIn under two URLs and two scores. The second pass keeps the
highest-scoring copy, and every copy is still written to history so the losing
URL does not resurface as new tomorrow.

Content identity is company plus requisition code, or company plus normalized
title when no code is present. An unnamed company falls back to URL identity:
an anonymous posting is not evidence of sameness.

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

## Troubleshooting

**`pnpm search` returns npm packages.** The script is `jobs`, not `search`:
`pnpm search` is a pnpm built-in that queries the npm registry. It never runs a
package script, and with `--` it silently returns registry results rather than
failing. `pnpm run search` prints a pointer to the right command.

**`ERR_PNPM_IGNORED_BUILDS` on any `pnpm run`.** `pnpm-workspace.yaml` must set
`allowBuilds.esbuild: true`. pnpm 11 otherwise leaves a `set this to true or
false` placeholder there, and every script exits 1 before it starts.

**No results at all.** Widen the role file: check `must_have_any`, then
`min_salary_usd`, then `location_policy`. A 2-day `max_age_days` is aggressive
enough that Remote OK and We Work Remotely contribute nothing.

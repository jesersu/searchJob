---
role: mobile
label: "Senior Mobile Developer — iOS first"
seniority: [senior, staff, lead]
years_experience: 6

# Query expansion: every term is fanned out against every source.
# Tiered because not all terms carry the same weight for this profile.
# A single string would be a mistake: no offer is titled "mobile developer".
queries:
  primary:
    - ios engineer
    - ios developer
    - swift developer
    - swiftui
    - senior mobile engineer
  secondary:
    - react native developer
    - android engineer
    - kotlin developer
    - mobile developer
    - flutter developer

# Feeds the Scorer. An `expert` hit outweighs a `working` one.
stack:
  expert:
    - swift
    - swiftui
    - uikit
    - objective-c
    - combine
    - core data
    - spm
    - viper
    - mvvm
    - clean architecture
    - xctest
  strong:
    - kotlin
    - jetpack compose
    - react native
    - typescript
    - graphql
    - offline-first
    - fastlane
    - ci/cd
  working:
    - flutter
    - dart
    - docker
    - aws

# Discards the offer when neither its title nor its tags mention any of these.
must_have_any: [ios, swift, swiftui, mobile, react native, kotlin, android, flutter]

exclude_title:
  - junior
  - jr
  - jr.
  - intern
  - trainee
  - practicante
  - qa
  - tester
exclude_stack:
  - php
  - wordpress
  - salesforce
  - sap
  - unity
  - maui
  - xamarin

remote: required
country: peru
zones: [latam, americas, global]
# balanced = drop only postings scoped to an unreachable place (Australia,
# India, Europe). strict = also drop postings that name no place at all.
# off = no filtering, location becomes a scoring signal only.
location_policy: balanced
timezone: "America/Lima (UTC-5)"

# Your own floor, in USD per month. This is the one value nothing can infer.
min_salary_usd: 3000
# Score ceiling. At or above this, salary earns full credit. Kept separate from
# the floor so widening coverage does not flatten the top of the ranking.
salary_target_usd: 9000
salary_period: monthly
salary_unknown_policy: keep   # keep | drop -> most boards publish no salary

# Maximum age in days. Commented out = no filter.
# Measured across the five sources: at 2 days Remote OK and We Work Remotely
# contribute zero, because they publish in batches rather than daily.
# Seven days keeps every source represented. Override with --max-age or --since.
# max_age_days: 7
unknown_date_policy: keep

english_level: professional
availability: immediate
contract_types: [freelance, contractor, full-time-remote]
---

## Context

The frontmatter above is what the tool reads. This body is for you: it is the
context no filter captures, and it is what a future `--semantic` pass would
judge an offer against.

Describe what actually differentiates you. Not "6 years of mobile" — that is on
every CV. Something like: native iOS plus offline-first architectures with
conflict resolution, plus professional English for daily work with distributed
US teams.

## What I want

- Product companies or product-focused consultancies. Not staffing.
- Distributed teams with overlap with US hours.
- End-to-end ownership: technical design, development, release.

## What I don't want

- Mid-level roles advertised as senior.
- Positions requiring relocation or full European hours.
- Stacks outside mobile.

## Signals of a good offer

- Names Swift or SwiftUI in the title or the first requirements.
- Talks about architecture, not just "building screens".
- Publishes a salary range in USD.
- Says "LATAM friendly", "Americas" or "remote worldwide".

## Red flags

- "Full stack mobile + backend + DevOps" in one role. That is three jobs.
- Asks for 10+ years of Swift. Swift shipped in 2014.
- No range, "competitive salary", and a staffing agency.

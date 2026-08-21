# searchJob — project instructions

## Branching model

This project uses a reduced GitFlow. It **overrides** the global `branch-pr`
skill, which expects trunk-based names such as `feat/<description>`.

| Branch | Purpose | Merges into |
|--------|---------|-------------|
| `main` | Released, production-ready state. Tagged releases only. | — |
| `develop` | Integration branch. Everything lands here first. | `main` |
| `feature/<NNN>-<description>` | One unit of work. | `develop` |

**Branch name regex (enforced by `.githooks/pre-push`):**

```
^(main|develop|feature/[0-9]{3}-[a-z0-9._-]+)$
```

`<NNN>` is a zero-padded three-digit sequence: `001`, `002`, `017`.
`<description>` is lowercase kebab-case.

Valid: `feature/001-linkedin-adapter`, `feature/012-semantic-scoring`
Invalid: `feature/1-foo`, `feat/linkedin`, `feature/001_Foo`

## Rules

- Never commit directly to `main` or `develop`. The pre-push hook rejects it.
- Branch off `develop`, never off `main`.
- Open pull requests against `develop`.
- Commit messages stay conventional (`feat:`, `fix:`, `chore:`), per global rules.
- Do not add AI attribution or `Co-Authored-By` lines to commits.

## Starting a feature

```bash
git checkout develop && git pull
git checkout -b feature/003-linkedin-adapter
```

## Hooks

Hooks live in `.githooks/`, which is versioned, unlike `.git/hooks/`.
`pnpm install` wires them up via the `prepare` script. To do it by hand:

```bash
git config core.hooksPath .githooks
```

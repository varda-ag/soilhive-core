# Contributing to SoilHive Core

## Prerequisites

- Node.js 22
- pnpm (for the frontend/shared packages)
- npm (for the backend — see [backend docs](docs/backend.md))
- Docker (optional, for the full stack via `docker-compose`)

Install dependencies from the repo root:

```bash
pnpm install
```

## Branch naming

Branches must follow the pattern:

```
<type>/<short-description>
```

Types mirror the conventional commit types below (`feature`, `fix`, `chore`, etc.).

## Commit messages

This project uses **Conventional Commits**, enforced by commitlint on every PR targeting `main`. Non-conforming commits will fail CI.

Format:

```
<type>(<optional scope>): <short description>
```

Allowed types:

| Type | When to use |
|------|-------------|
| `feat` | New feature or user-visible addition |
| `fix` | Bug fix |
| `perf` | Performance improvement (no behaviour change) |
| `refactor` | Code restructuring (no behaviour change) |
| `build` | Build system, Docker, dependency changes |
| `chore` | Housekeeping with no production impact |
| `ci` | CI/CD workflow changes |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `style` | Formatting, whitespace (no logic change) |

Scope is optional but encouraged when the change is scoped to a package: `feat(fe):`, `fix(backend):`.

`feat` and `fix` commits are included in the auto-generated [CHANGELOG](CHANGELOG.md) and trigger a release via release-please.

## Pre-commit hooks

Husky runs the following automatically on every commit:

1. `pnpm i -r --quiet` — keeps lockfile consistent
2. `npm run lint:fix` — auto-fixes lint errors
3. Backend unit tests
4. Frontend unit tests

Fix any test or lint failures before committing.

## Submitting a pull request

1. Branch off `main`.
2. Keep PRs focused — one PR, one concern.
3. **PR title** must also follow Conventional Commits format (commitlint checks the title in addition to commits).
4. Fill in a description explaining _what_ changed and _why_.
5. Ensure CI passes: commitlint, and the Node.js build jobs for `frontend` and `backend`.
6. All files in the repo are owned by `@varda-ag/platform-team` (see [CODEOWNERS](CODEOWNERS)). A review from that team is required before merging.

## Code review

- Reviewers aim to respond within two business days.
- Address review comments by pushing new commits — do not force-push after a review has started.
- Resolve threads yourself once addressed so reviewers know what needs a second look.
- Squash before merge, but preserve meaningful commit boundaries.

## Code style

Formatting and linting are enforced automatically:

```bash
pnpm run format       # fix formatting (prettier)
pnpm run lint:fix     # fix lint errors (eslint)
```

Run both before opening a PR to avoid CI noise. Prettier covers `ts`, `tsx`, `json`, `css`, and `md` files.

## Project structure

| Path | Contents |
|------|----------|
| `frontend/` | React frontend (pnpm) |
| `backend/` | Node.js backend (npm) |
| `docs/` | Project documentation |
| `docker-compose.yml` | Production stack |
| `docker-compose-dev.yml` | Development stack |

See the [docs](docs/) folder for deeper guides on each area.

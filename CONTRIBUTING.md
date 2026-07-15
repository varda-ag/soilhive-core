# Contributing to SoilHive Core

## Who can contribute


SoilHive Core welcomes external contributions. To keep the process manageable, we maintain an **approved contributors list** — a lightweight step before your first pull request.

If you would like to contribute for the first time, open a GitHub issue describing the change you intend to make (or identify an existing one), then contact the team by raising a 'Contributor Request' issue to request access. Once approved and added to the list, you may fork the repo and open a pull request following the process below.

Every pull request must be linked to a GitHub issue describing the change. PRs without a corresponding issue will not be reviewed.

## What can be contributed

We're happy to consider most contributions, but to keep the project focused, please keep the following in mind:

- **New features** should be core to the platform — that is, they help with uploading, harmonizing, or serving data. If you have an idea outside that scope, it's still worth opening an issue to discuss it, but be aware it may not be a fit.
- **Bug fixes** are always welcome. Please describe the issue clearly in the linked GitHub issue: what's happening, what you expected instead, and how to reproduce it.
- Once your issue is open, the team will take a look and mark it as valid before work begins. This helps make sure your effort goes toward something we can merge, and it's the point at which we're happy for you to start working on a PR.

---

## Prerequisites

- Node.js 24
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

Beyond formatting, code should follow the conventions already established elsewhere in the codebase (naming, file layout, error handling, etc.) — when in doubt, match the style of the surrounding code.

## Tests

New code should come with tests, written in the same style and using the same tools as the existing tests in that package (see `frontend/` and `backend/` for examples). Bug fixes should include a test that reproduces the bug and confirms the fix. PRs that reduce test coverage without a good reason will be asked to add it back.

## Project structure

| Path | Contents |
|------|----------|
| `frontend/` | React frontend (pnpm) |
| `backend/` | Node.js backend (npm) |
| `docs/` | Project documentation |
| `docker-compose.yml` | Production stack |
| `docker-compose-dev.yml` | Development stack |

See the [docs](docs/) folder for deeper guides on each area.

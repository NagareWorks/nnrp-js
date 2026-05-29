# Contributing to nnrp-js

This repository publishes TypeScript and JavaScript SDK packages for NNRP, so contribution flow needs to stay
predictable.

## Branch Strategy

The repository default branch is the stable branch for released or release-ready SDK state.

For the public GitHub repository, use `main` as the stable branch.

`develop` is the version integration branch for active preview work. Preview feature, fix, documentation, and
maintenance branches should merge into `develop` first.

Use short-lived topic branches for day-to-day work:

- `feature/<scope>-<topic>` for new capabilities
- `fix/<scope>-<topic>` for bug fixes
- `docs/<scope>-<topic>` for documentation-only changes
- `chore/<scope>-<topic>` for maintenance and tooling updates
- `release/<version>` only after `develop` is ready to freeze into a public package release candidate

Rules:

- Branch from the latest `develop` for active preview work.
- Branch from `main` only for hotfixes against already released stable state.
- Keep topic branches focused on one slice of work.
- Merge normal preview work back to `develop` through a pull request.
- Do not push directly to `main` or `develop` except for repository bootstrap or administrator-approved emergency
  maintenance.
- Do not publish packages directly from topic branches.

## Commit Message Convention

Use Conventional Commits.

Preferred forms:

- `feat: add native artifact resolver`
- `fix: reject malformed capability manifest`
- `docs: clarify package layout`
- `chore: tighten CI dependency bootstrap`
- `test: add transport selection regression`

Rules:

- Keep the subject line imperative.
- Keep the first line concise.
- Use a scope only when it adds clarity.
- Normal PRs from `feature/*`, `fix/*`, `docs/*`, or `chore/*` branches should contain exactly one commit before review.

## Pull Request Expectations

Every PR should:

- target `develop` for normal preview work, `main` for stable hotfixes, or `release/<version>` only during an active
  release freeze
- explain the user-facing or engineering motivation
- summarize the main modules or flows changed
- list the validation performed
- mention release impact when distribution output changes
- pass the `required-checks` GitHub Actions job before merge

## Validation Expectations

Before opening or merging a PR, prefer the narrowest validation that proves the touched slice:

- `deno task format:check`
- `deno lint`
- `deno task typecheck`
- `deno task test`
- `deno task build`

PRs that affect CI, packaging, or release assets should include the exact command or workflow path used for validation.

## Release Notes

Do not reuse a published package version. If package contents change after publication, create a new version.

Public package publishing will be gated through a release workflow and the `release` GitHub environment once npm package
names and native/WASM artifact policy are frozen.

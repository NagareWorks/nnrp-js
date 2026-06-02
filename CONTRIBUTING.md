# Contributing to nnrp-js

This repository publishes TypeScript and JavaScript SDK packages for NNRP, so contribution flow needs to stay
predictable.

## Branch Strategy

The repository default branch is the stable branch for released or release-ready SDK state.

For the public GitHub repository, use `main` as the stable branch.

Before the first stable package line is frozen, `main` is also the active integration branch. Add a long-lived `develop`
branch only when the repository needs a separate version integration branch for concurrent released and unreleased
lines.

Use short-lived topic branches for day-to-day work:

- `feature/<scope>-<topic>` for new capabilities
- `fix/<scope>-<topic>` for bug fixes
- `docs/<scope>-<topic>` for documentation-only changes
- `chore/<scope>-<topic>` for maintenance and tooling updates
- `release/<version>` only after `main` is ready to freeze into a public package release candidate

Rules:

- Branch from the latest `main` for active preview work.
- Branch from `main` only for hotfixes against already released stable state.
- Keep topic branches focused on one slice of work.
- Merge normal preview work back to `main` through a pull request.
- Do not push directly to `main` except for repository bootstrap or administrator-approved emergency maintenance.
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

- target `main` for normal preview work and stable hotfixes, or `release/<version>` only during an active release freeze
- explain the user-facing or engineering motivation
- summarize the main modules or flows changed
- list the validation performed
- mention release impact when distribution output changes
- pass the `required-checks` GitHub Actions job before merge

## Validation Expectations

Before opening or merging a PR, prefer the narrowest validation that proves the touched slice:

- `deno task format:check`
- `deno lint`
- `deno task runtime-policy`
- `deno task typecheck`
- `deno task test`
- `deno task build`

PRs that affect CI, packaging, or release assets should include the exact command or workflow path used for validation.

## JavaScript Runtime Policy

This repository uses Deno as the repository tooling layer only:

- formatting
- linting
- tests
- TypeScript type checking
- TypeScript-to-Node-compatible package builds

Published packages must remain Node.js-compatible ESM packages with `.d.ts` declarations. Runtime code must not depend
on Deno-specific APIs unless that code lives behind an explicitly isolated Deno-only development tool. SDK APIs, package
exports, native artifact loading, WASM loading, and examples must continue to work in Node.js-compatible environments.

Bun is not accepted in this repository. Do not add:

- Bun runtime support or compatibility shims
- Bun-specific package exports, lockfiles, scripts, tests, CI jobs, docs, badges, or examples
- Bun-specific native loader branches
- Bun-specific WASM loader branches
- Bun-specific benchmark or release paths

The project treats Bun as outside the trusted runtime and tooling base for this SDK. The rationale is supply-chain and
governance risk: the project has concerns about AI-driven runtime narratives, reviewability of unusually large or rapid
runtime rewrites, the risk profile of large unsafe/native surfaces in a JavaScript runtime, and public vendor conduct
that may affect trust in neutral infrastructure. These concerns are enough for this repository to avoid Bun even as an
optional adaptation target.

If future compatibility testing observes Bun behavior, keep it outside required gates and outside the SDK support
contract unless this policy is explicitly revised.

## Release Notes

Do not reuse a published package version. If package contents change after publication, create a new version.

Public package publishing will be gated through a release workflow and the `release` GitHub environment once npm package
names and native/WASM artifact policy are frozen.

The publish workflow is not enabled yet. When it is enabled, keep the registry token scoped to the GitHub `release`
environment and store it as `NPM_TOKEN`. The token must be able to publish `@nnrp/core`, `@nnrp/native`, and
`@nnrp/wasm`; it must not be available to normal CI, pull request checks, or release dry-run jobs.

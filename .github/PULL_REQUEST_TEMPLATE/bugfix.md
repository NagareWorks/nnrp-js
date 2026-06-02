## Bug

- What was broken?
- How could the issue be reproduced?

## Root Cause

- What actually caused the issue?

## Fix

- What changed to fix it?
- What regression risk remains?

## Validation

- [ ] `deno task lint`
- [ ] `deno task test`
- [ ] `deno task coverage`
- [ ] Regression test added or existing failure reproduced
- [ ] `deno task package-check` if package output, exports, or release metadata changed

Commands or workflow runs used:

```text
```

## Release Impact

- [ ] No package output change
- [ ] npm package contents changed
- [ ] Release workflow behavior changed
- [ ] Public API declarations or export maps changed

## Checklist

- [ ] Branch name matches repository conventions
- [ ] Commit messages follow Conventional Commits
- [ ] PR is squashed to one commit unless this is necessary `release/<version>` branch work
- [ ] User-facing behavior changes are documented
- [ ] `scripts/public-api/*.d.ts` snapshots were updated when public exports changed

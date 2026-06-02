## Summary

- What release or release-preparation change is included?

## Versioning

- Target version:
- Why this version is needed:

## Package Impact

- [ ] npm package metadata changed
- [ ] npm package contents changed
- [ ] Release workflow behavior changed

Describe the release-facing impact:

## Validation

- [ ] `deno task release-dry-run`
- [ ] `deno task package-check`
- [ ] Conformance smoke output was reviewed
- [ ] Benchmark smoke output was reviewed

Commands or workflow runs used:

```text
```

## Manual Registry Steps

- [ ] No manual registry work required
- [ ] npm registry state was reviewed
- [ ] GitHub Release asset expectations were reviewed if release assets are enabled

Notes:

## Checklist

- [ ] Branch name matches repository conventions
- [ ] Commit messages follow Conventional Commits
- [ ] PR is squashed to one commit unless this is necessary `release/<version>` branch work
- [ ] Release notes or docs were updated if needed

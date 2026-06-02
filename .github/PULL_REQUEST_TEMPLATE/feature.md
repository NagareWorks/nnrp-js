## Summary

- What capability does this PR add?
- Why is it needed now?

## Implementation

- Main modules or flows changed:
- Any protocol, runtime, or packaging assumptions introduced:
- Follow-up work, if any:

## Validation

- [ ] `deno task lint`
- [ ] `deno task test`
- [ ] `deno task coverage`
- [ ] `deno task build`
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
- [ ] `scripts/public-api/*.d.ts` snapshots were updated when public exports changed
- [ ] `nnrp-doc` JS/TS SDK pages were updated when public API names or package boundaries changed
- [ ] Local README or TODO files were updated when package layout, release gates, or runtime policy changed

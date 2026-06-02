## Summary

- What maintenance change is included?
- Why is it being made now?

## Change Type

- [ ] CI or workflow change
- [ ] Tooling or dependency maintenance
- [ ] Packaging metadata update
- [ ] Refactor with no intended behavior change

## Validation

- [ ] `deno task lint`
- [ ] `deno task test`
- [ ] `deno task coverage`
- [ ] Targeted validation for the affected tooling or workflow path
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
- [ ] Follow-up operational work is documented if needed
- [ ] Local README or TODO files were updated when package layout, release gates, or runtime policy changed

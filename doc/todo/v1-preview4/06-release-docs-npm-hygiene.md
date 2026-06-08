# 06 - Release, Docs, And npm Hygiene

## Release Pipeline

- [ ] Add preview4 version resolution.
- [ ] Add release inputs for npm dist-tag.
- [ ] Add release inputs for GitHub tag creation.
- [ ] Add package publish ordering.
  - [ ] Core package.
  - [ ] Transport packages.
  - [ ] Role packages.
- [ ] Ensure first publish of any new package can be followed by trusted publishing setup.
- [ ] Ensure reruns skip already-published package versions safely.

## Package Validation

- [ ] Verify each package has keywords.
- [ ] Verify each package has README content.
- [ ] Verify each package has contributor and banner content where expected.
- [ ] Verify role packages do not contain transport artifacts.
- [ ] Verify transport packages contain only their owned artifacts.
- [ ] Verify browser package does not contain native libraries.
- [ ] Verify Node transport packages contain native artifacts for supported platforms.

## Docs

- [ ] Update JS SDK quick-start for preview4 install commands.
- [ ] Document role package selection.
- [ ] Document transport package selection.
- [ ] Document IPC examples.
- [ ] Document WebSocket Node examples.
- [ ] Document WebSocket browser examples.
- [ ] Document runtime control examples.
- [ ] Document runtime object examples.
- [ ] Document wire conformance command examples.

## CI

- [ ] Run typecheck.
- [ ] Run unit tests.
- [ ] Run package boundary checks.
- [ ] Run conformance dry-runs.
- [ ] Run package tarball inspection.
- [ ] Run benchmark smoke where local runtime permits.

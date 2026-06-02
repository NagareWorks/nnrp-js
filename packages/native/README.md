# @nnrp/native

Node-compatible native runtime surface for NNRP.

This package exposes the backend client/server facade, native artifact resolution, capability manifests, and transport
selection helpers. Protocol critical behavior is intended to be backed by `nnrp-rs` native artifacts as the preview
implementation matures.

The package includes TypeScript declaration files. JavaScript consumers can use the runtime API directly without
installing a separate type package.

Native artifacts are policy-injected during the preview phase. Consumers can pass an explicit library path, an artifact
directory, or a test/adapter FFI binding; the package does not bundle platform libraries until the release artifact
matrix is frozen.

SDK reference: https://nagareworks.github.io/nnrp-doc/en/sdk/javascript/api/native

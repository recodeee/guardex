## Why

- The Active Agents VS Code companion still showed version `0.0.1` after plugin edits because nothing enforced a visible version bump when the shipped extension changed.
- That makes local reinstall verification ambiguous in VS Code and makes it too easy to ship plugin edits behind a stale installed version label.

## What Changes

- Bump the shipped Active Agents extension manifest version.
- Add a focused regression that requires a higher extension version whenever plugin-shipping files change on a branch.
- Keep the live and template extension manifests aligned so installs and scaffolds report the same version.

## Impact

- Local VS Code installs show a new extension version after plugin edits.
- Future plugin branches fail fast in tests if they forget to bump the extension version.
- No runtime behavior changes beyond extension metadata and install-path visibility.

## Why

- `src/toolchain/index.js` and `src/cli/main.js` still carry duplicate custom version-comparison and stdin line-reader helpers.
- The custom semver logic ignores prerelease ordering, and the single-byte stdin reader splits multi-byte characters.
- `src/scaffold/index.js` still hand-rolls JSONC stripping even though the repo only needs robust JSONC parsing for settings-style files.

## What Changes

- Add shared core helpers for semver comparison and stdin line reading, then route both `src/toolchain/index.js` and `src/cli/main.js` through them.
- Replace the custom JSONC stripping/parsing path in `src/scaffold/index.js` with `jsonc-parser`.
- Add focused regression coverage for prerelease version ordering, multi-byte stdin reads, and JSONC parsing with comments/trailing commas.

## Acceptance Criteria

- Prerelease ordering comes from shared semver helpers under `src/core`, so `1.2.3` sorts after `1.2.3-alpha.4` and `1.2.3-alpha.10` sorts after `1.2.3-alpha.2`.
- Interactive yes/no prompts keep reading a single logical line without corrupting multi-byte UTF-8 input.
- JSONC parsing for scaffold-owned settings files uses `jsonc-parser` and preserves string literals that contain comment-like text.
- CLI commands keep their existing names, prompts, and output wording on `status`, `release`, and `setup` flows.

## Impact

- Primary files: `package.json`, `package-lock.json`, `src/core/**`, `src/toolchain/index.js`, `src/cli/main.js`, `src/scaffold/index.js`, and targeted tests.
- Main risk is behavior drift in `gx status`, self-update prompts, README-driven release selection, and VS Code settings repair, so verification stays focused on those paths.
- This is an internal cleanup/correctness pass only; command names, output wording, and managed-file behavior must stay stable.

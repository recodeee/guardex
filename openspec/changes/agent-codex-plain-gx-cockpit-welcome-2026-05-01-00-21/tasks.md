# Tasks

## 1. Spec

- [x] 1.1 Capture plain interactive `gx` cockpit behavior.

## 2. Tests

- [x] 2.1 Cover interactive no-argument `gx` opening cockpit.
- [x] 2.2 Cover non-interactive no-argument `gx` printing status.
- [x] 2.3 Cover `GUARDEX_LEGACY_STATUS=1` preserving status output.
- [x] 2.4 Cover explicit `gx status` output.

## 3. Implementation

- [x] 3.1 Route interactive no-argument `gx` through cockpit default launch.
- [x] 3.2 Keep non-TTY and legacy env paths on status.
- [x] 3.3 Add cockpit default fallback order: Kitty, tmux, inline render.

## 4. Verification

- [x] 4.1 Run focused Node tests.
  - Evidence: `node --test test/default-gx-cockpit.test.js test/cockpit-command.test.js test/cli-args-dispatch.test.js` passed (`23/23`).
- [x] 4.2 Validate OpenSpec change.
  - Evidence: `openspec validate agent-codex-plain-gx-cockpit-welcome-2026-05-01-00-21 --type change --strict` passed.
- [x] 4.3 Run diff whitespace check.
  - Evidence: `git diff --check` passed.
- [x] 4.4 Run full Node test suite.
  - Evidence: `npm test` passed (`492` passed, `1` skipped, `0` failed).

## 5. Cleanup

- [ ] 5.1 Run the finish pipeline: `gx branch finish --branch agent/codex/plain-gx-cockpit-welcome-2026-05-01-00-21 --base main --via-pr --wait-for-merge --cleanup`.
- [ ] 5.2 Record PR URL, final `MERGED` state, and sandbox cleanup evidence.

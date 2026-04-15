# critic tasks

## 1. Spec

- [x] Define requirements and scope for critic
- [x] Confirm acceptance criteria are explicit and testable

## 2. Tests

- [x] Define verification approach and evidence requirements
- [x] List concrete commands for verification

## 3. Implementation

- [x] Execute role-specific deliverables
- [x] Capture decisions, risks, and handoff notes

## 4. Checkpoints

- [x] Publish checkpoint update for this role

## Review Notes

- The optional `fast-check` import is a reasonable scoped mitigation because it
  prevents hard failures when the dependency is missing without changing the
  test logic when it is installed.
- The widened invalid-flag assertion avoids brittle stderr coupling, but it
  should continue to enforce a non-zero exit status and a recognizable failure
  path in future CLI refactors.

## Risks / Handoff

- Missing `fast-check` now means the fuzz property test is skipped rather than
  exercised.
- Repository-wide test failures are currently dominated by the unrelated
  `withPackageJson is not defined` regression in `test/install.test.js`.

# verifier tasks

## 1. Spec

- [x] Define requirements and scope for verifier
- [x] Confirm acceptance criteria are explicit and testable

## 2. Tests

- [x] Define verification approach and evidence requirements
- [x] List concrete commands for verification

## 3. Implementation

- [x] Execute role-specific deliverables
- [x] Capture decisions, risks, and handoff notes

## 4. Checkpoints

- [x] Publish checkpoint update for this role

## Verification

- PASS — `node --test test/fuzzing.test.js`
  - `fuzz: status rejects unknown option patterns`
  - `# pass 1`
  - `# fail 0`
- FAIL — `npm test`
  - full suite exits non-zero before reaching unrelated lanes because
    `test/install.test.js` raises `ReferenceError: withPackageJson is not defined`
  - treat the failure as a pre-existing repository regression, not as evidence
    against the scoped fuzzing publish change

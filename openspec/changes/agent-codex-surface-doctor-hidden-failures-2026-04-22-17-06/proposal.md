## Why

- `gx doctor` compact auto-finish output still follows raw branch iteration order, so a single real failure can disappear behind six visible skip rows.
- That leaves users with a red `failed=1` summary and no visible failed branch line, which looks like miscounting even when the hidden detail is technically correct.

## What Changes

- Prioritize compact auto-finish details by severity so failed rows surface before skipped rows when the list is truncated.
- Make the compact hidden-results line report hidden status counts (`fail=...`, `skip=...`) instead of only a raw branch total.
- Add direct unit coverage around `printAutoFinishSummary` for both surfaced and still-hidden failure cases.

## Impact

- Affects only human-readable `gx doctor` auto-finish rendering in non-verbose mode.
- Keeps verbose mode and the underlying auto-finish accounting unchanged.
- Main risk: changing compact detail order could surprise anyone expecting raw branch order, so the new ordering stays status-first and stable within each status bucket.

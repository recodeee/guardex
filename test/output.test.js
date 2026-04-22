const test = require('node:test');
const assert = require('node:assert/strict');

const { printAutoFinishSummary } = require('../src/output');

function captureConsoleLogs(run) {
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.map((value) => String(value)).join(' '));
  };

  try {
    run();
  } finally {
    console.log = originalLog;
  }

  return lines;
}

test('printAutoFinishSummary surfaces failed rows before skipped rows in compact mode', () => {
  const summary = {
    enabled: true,
    attempted: 8,
    completed: 0,
    skipped: 7,
    failed: 1,
    details: [
      '[skip] agent/one: already merged into main.',
      '[skip] agent/two: already merged into main.',
      '[skip] agent/three: already merged into main.',
      '[skip] agent/four: already merged into main.',
      '[skip] agent/five: already merged into main.',
      '[skip] agent/six: already merged into main.',
      '[skip] agent/seven: already merged into main.',
      '[fail] agent/fail: auto-finish failed. unexpected auth outage',
    ],
  };

  const lines = captureConsoleLogs(() => {
    printAutoFinishSummary(summary, { baseBranch: 'main', detailLimit: 6 });
  });

  assert.match(lines[0], /Auto-finish sweep \(base=main\): attempted=8, completed=0, skipped=7, failed=1/);
  assert.match(lines[1], /\[fail\] agent\/fail: unexpected auth outage/);
  assert.equal(lines.filter((line) => /\[skip\]/.test(line)).length, 5);
  assert.match(lines.at(-1), /2 more branch result\(s\) hidden: skip=2/);
});

test('printAutoFinishSummary keeps hidden failure counts explicit when compact output still truncates', () => {
  const summary = {
    enabled: true,
    attempted: 8,
    completed: 0,
    skipped: 6,
    failed: 2,
    details: [
      '[skip] agent/one: already merged into main.',
      '[skip] agent/two: already merged into main.',
      '[skip] agent/three: already merged into main.',
      '[skip] agent/four: already merged into main.',
      '[skip] agent/five: already merged into main.',
      '[skip] agent/six: already merged into main.',
      '[fail] agent/fail-one: auto-finish failed. unexpected auth outage',
      '[fail] agent/fail-two: auto-finish failed. remote ref vanished',
    ],
  };

  const lines = captureConsoleLogs(() => {
    printAutoFinishSummary(summary, { baseBranch: 'main', detailLimit: 1 });
  });

  assert.match(lines[1], /\[fail\] agent\/fail-one: unexpected auth outage/);
  assert.match(lines[2], /7 more branch result\(s\) hidden: fail=1, skip=6/);
});

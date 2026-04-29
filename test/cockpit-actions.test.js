'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const cockpit = require('../src/cockpit');
const {
  startAgentLane,
  normalizeStartResult,
} = require('../src/cockpit/actions');

test('startAgentLane delegates to the gx agents start implementation', () => {
  const calls = [];

  const result = startAgentLane(
    {
      task: 'fix flaky test',
      agent: 'codex',
      base: 'main',
      claims: ['src/foo.js', 'test/foo.test.js'],
    },
    {
      startImplementation(request) {
        calls.push(request);
        return {
          ok: true,
          sessionId: 'session-123',
          branch: 'agent/codex/fix-flaky-test',
          worktreePath: '/repo/.omx/agent-worktrees/fix-flaky-test',
          message: 'Started agent lane.',
        };
      },
    },
  );

  assert.deepEqual(calls, [
    {
      task: 'fix flaky test',
      agent: 'codex',
      base: 'main',
      claims: ['src/foo.js', 'test/foo.test.js'],
    },
  ]);
  assert.deepEqual(result, {
    ok: true,
    sessionId: 'session-123',
    branch: 'agent/codex/fix-flaky-test',
    worktreePath: '/repo/.omx/agent-worktrees/fix-flaky-test',
    message: 'Started agent lane.',
  });
});

test('startAgentLane normalizes async implementation results', async () => {
  const result = await startAgentLane(
    { task: 'ship feature', agent: 'claude', base: 'dev', claims: [] },
    {
      async startAgentLane() {
        return {
          session: { id: 'session-async' },
          lane: { branch: 'agent/claude/ship-feature' },
          worktree: { path: '/repo/.omx/agent-worktrees/ship-feature' },
        };
      },
    },
  );

  assert.deepEqual(result, {
    ok: true,
    sessionId: 'session-async',
    branch: 'agent/claude/ship-feature',
    worktreePath: '/repo/.omx/agent-worktrees/ship-feature',
    message: 'Started agent lane.',
  });
});

test('cockpit index exports startAgentLane action without dropping render API', () => {
  assert.equal(cockpit.startAgentLane, startAgentLane);
  assert.equal(cockpit.actions.startAgentLane, startAgentLane);
  assert.equal(typeof cockpit.render, 'function');
  assert.equal(typeof cockpit.startCockpit, 'function');
});

test('normalizeStartResult preserves failure shape', () => {
  assert.deepEqual(normalizeStartResult({ ok: false, message: 'missing agent' }), {
    ok: false,
    sessionId: undefined,
    branch: undefined,
    worktreePath: undefined,
    message: 'missing agent',
  });
});

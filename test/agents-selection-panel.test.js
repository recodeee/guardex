const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  countForAgent,
  normalizeAgentSelections,
  parseAgentSelectionSpec,
  renderAgentSelectionPanel,
  selectedAgentCount,
} = require('../src/agents/selection-panel');

test('parseAgentSelectionSpec accepts repeated agent counts', () => {
  assert.deepEqual(parseAgentSelectionSpec('codex:3,claude,gemini=2'), [
    { id: 'codex', count: 3 },
    { id: 'claude', count: 1 },
    { id: 'gemini', count: 2 },
  ]);
});

test('normalizeAgentSelections merges repeated agents and enforces the max', () => {
  const selections = normalizeAgentSelections({
    agentSelectionSpecs: ['codex:2,claude', 'codex'],
  });

  assert.equal(selectedAgentCount(selections), 4);
  assert.equal(countForAgent(selections, 'codex'), 3);
  assert.equal(countForAgent(selections, 'claude'), 1);
  assert.throws(
    () => normalizeAgentSelections({ agentSelectionSpecs: ['codex:11'] }),
    /Selected agent count 11 exceeds the maximum 10/,
  );
});

test('renderAgentSelectionPanel shows selected count and codex account setting', () => {
  const output = renderAgentSelectionPanel({
    task: 'repair auth',
    base: 'main',
    claims: ['src/auth.js'],
    agentSelectionSpecs: ['codex:3'],
  });

  assert.match(output, /Select Agent\(s\)/);
  assert.match(output, /Selected: 3\/10/);
  assert.match(output, /● Codex cx x3/);
  assert.match(output, /Codex accounts: 3/);
  assert.match(output, /task: repair auth/);
  assert.match(output, /base: main/);
  assert.match(output, /claims: src\/auth\.js/);
});

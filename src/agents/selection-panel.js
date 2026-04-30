'use strict';

const {
  getAgentDefinitions,
  resolveAgent,
} = require('./registry');

const DEFAULT_MAX_SELECTED_AGENTS = 10;

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flagName} requires a positive integer`);
  }
  return parsed;
}

function parseAgentSelectionToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const match = token.match(/^([^:=\s]+)(?::|=)?(\d+)?$/);
  if (!match) {
    throw new Error(`Invalid agent selection: ${token}`);
  }
  return {
    id: match[1],
    count: match[2] ? parsePositiveInteger(match[2], '--agents') : 1,
  };
}

function parseAgentSelectionSpec(rawSpec) {
  return String(rawSpec || '')
    .split(',')
    .map(parseAgentSelectionToken)
    .filter(Boolean);
}

function normalizeAgentSelections(options = {}) {
  const maxSelected = options.maxSelected || DEFAULT_MAX_SELECTED_AGENTS;
  const merged = new Map();
  const addSelection = (selection) => {
    const agent = resolveAgent(selection.id);
    const existing = merged.get(agent.id) || { agent, count: 0 };
    existing.count += selection.count;
    merged.set(agent.id, existing);
  };

  const specs = Array.isArray(options.agentSelectionSpecs) ? options.agentSelectionSpecs : [];
  if (specs.length > 0) {
    specs.flatMap(parseAgentSelectionSpec).forEach(addSelection);
  } else {
    addSelection({
      id: options.agent || 'codex',
      count: options.count || 1,
    });
  }

  const selections = [...merged.values()];
  const total = selectedAgentCount(selections);
  if (total > maxSelected) {
    throw new Error(`Selected agent count ${total} exceeds the maximum ${maxSelected}`);
  }
  return selections;
}

function selectedAgentCount(selections) {
  return selections.reduce((sum, selection) => sum + selection.count, 0);
}

function countForAgent(selections, agentId) {
  const selection = selections.find((candidate) => candidate.agent.id === agentId);
  return selection ? selection.count : 0;
}

function padLine(value, width) {
  const text = String(value || '');
  if (text.length >= width) return text.slice(0, width);
  return `${text}${' '.repeat(width - text.length)}`;
}

function framePanel(title, rows, width = 92) {
  const safeWidth = Math.max(40, width);
  const titleText = ` ${title} `;
  const topFill = Math.max(0, safeWidth - titleText.length - 2);
  const top = `┌${titleText}${'─'.repeat(topFill)}┐`;
  const bottom = `└${'─'.repeat(safeWidth - 2)}┘`;
  return [
    top,
    ...rows.map((row) => `│${padLine(` ${row}`, safeWidth - 2)}│`),
    bottom,
  ].join('\n');
}

function renderAgentSelectionPanel(options = {}) {
  const definitions = getAgentDefinitions();
  const maxSelected = options.maxSelected || DEFAULT_MAX_SELECTED_AGENTS;
  const selections = options.selections || normalizeAgentSelections({ ...options, maxSelected });
  const total = selectedAgentCount(selections);
  const claims = Array.isArray(options.claims) && options.claims.length > 0
    ? options.claims.join(', ')
    : 'none';
  const codexAccounts = countForAgent(selections, 'codex');
  const rows = [
    `Select one or more agents, then launch. Selected: ${total}/${maxSelected}`,
    '',
    ...definitions.map((agent) => {
      const count = countForAgent(selections, agent.id);
      const marker = count > 0 ? '●' : '○';
      const suffix = count > 1 ? ` x${count}` : '';
      return `${marker} ${agent.label} ${agent.shortLabel.toLowerCase()}${suffix}`;
    }),
    '',
    'Settings',
    `task: ${options.task || '-'}`,
    `base: ${options.base || 'current branch'}`,
    `Codex accounts: ${codexAccounts}`,
    `claims: ${claims}`,
    '',
    '↑/↓ navigate · Space toggle · +/- Codex accounts · Enter launch · ESC cancel',
  ];
  return `${framePanel('Select Agent(s)', rows)}\n`;
}

module.exports = {
  DEFAULT_MAX_SELECTED_AGENTS,
  countForAgent,
  framePanel,
  normalizeAgentSelections,
  parseAgentSelectionSpec,
  renderAgentSelectionPanel,
  selectedAgentCount,
};

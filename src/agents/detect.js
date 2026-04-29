const registry = require('./registry');
const { run } = require('../core/runtime');

function registryEntries() {
  if (typeof registry.getAgentDefinitions === 'function') {
    const definitions = registry.getAgentDefinitions();
    if (Array.isArray(definitions)) {
      return definitions;
    }
  }

  if (Array.isArray(registry.AGENT_IDS) && typeof registry.getAgentDefinition === 'function') {
    return registry.AGENT_IDS
      .map((agentId) => registry.getAgentDefinition(agentId))
      .filter((entry) => entry && typeof entry === 'object');
  }

  const source =
    registry.agents ||
    registry.AGENTS ||
    registry.registry ||
    registry.entries ||
    registry.default ||
    registry;

  if (Array.isArray(source)) {
    return source;
  }

  if (source && typeof source === 'object') {
    return Object.entries(source)
      .filter(([, entry]) => entry && typeof entry === 'object')
      .map(([id, entry]) => ({ id, ...entry }));
  }

  return [];
}

function findAgent(agentId) {
  if (typeof registry.getAgentDefinition === 'function') {
    const entry = registry.getAgentDefinition(agentId);
    if (entry) return entry;
  }

  if (typeof registry.resolveAgent === 'function') {
    try {
      const entry = registry.resolveAgent(agentId);
      if (entry) return entry;
    } catch (_error) {
      return null;
    }
  }

  if (typeof registry.getAgent === 'function') {
    const entry = registry.getAgent(agentId);
    if (entry) return entry;
  }

  return registryEntries().find((entry) => entry.id === agentId);
}

function registryAgentIds() {
  if (Array.isArray(registry.AGENT_IDS)) {
    return [...registry.AGENT_IDS];
  }

  if (typeof registry.getAgentDefinitions === 'function') {
    const definitions = registry.getAgentDefinitions();
    if (Array.isArray(definitions)) {
      return definitions.map((entry) => entry && entry.id).filter(Boolean);
    }
  }

  return registryEntries().map((entry) => entry.id).filter(Boolean);
}

function normalizeDetectCommand(detectCommand) {
  if (Array.isArray(detectCommand)) {
    const [cmd, ...args] = detectCommand;
    return { cmd, args, command: detectCommand.join(' ') };
  }

  if (typeof detectCommand === 'string') {
    const [cmd, ...args] = detectCommand.trim().split(/\s+/).filter(Boolean);
    return { cmd, args, command: detectCommand.trim() };
  }

  if (detectCommand && typeof detectCommand === 'object') {
    const cmd = detectCommand.cmd || detectCommand.command || detectCommand.bin;
    const args = Array.isArray(detectCommand.args) ? detectCommand.args : [];
    return {
      cmd,
      args,
      command: [cmd, ...args].filter(Boolean).join(' '),
    };
  }

  return { cmd: null, args: [], command: null };
}

function resultError(result) {
  if (result.error) {
    return result.error.message || String(result.error);
  }

  const output = `${result.stderr || ''}${result.stdout || ''}`.trim();
  if (output) return output;

  if (typeof result.status === 'number') {
    return `detect command exited with status ${result.status}`;
  }

  return 'detect command failed';
}

function detectionResult(entry, available, command, error = null) {
  return {
    id: entry.id,
    label: entry.label || entry.id,
    available,
    command,
    error,
  };
}

function detectAgent(agentId) {
  const entry = findAgent(agentId);
  if (!entry) {
    const known = registryAgentIds();
    const suffix = known.length > 0 ? ` (known agents: ${known.join(', ')})` : '';
    return detectionResult({ id: agentId, label: agentId }, false, null, `unknown agent: ${agentId}${suffix}`);
  }

  const { cmd, args, command } = normalizeDetectCommand(entry.detectCommand);
  if (!cmd) {
    return detectionResult(entry, false, command, 'missing detectCommand');
  }

  const result = run(cmd, args, { stdio: 'pipe' });
  if (!result.error && result.status === 0) {
    return detectionResult(entry, true, command, null);
  }

  return detectionResult(entry, false, command, resultError(result));
}

function detectAgents(agentIds) {
  const ids = Array.isArray(agentIds) ? agentIds : registryAgentIds();
  return ids.map((agentId) => detectAgent(agentId));
}

function detectAvailableAgents() {
  return detectAgents().filter((agent) => agent.available);
}

module.exports = {
  detectAgent,
  detectAgents,
  detectAvailableAgents,
};

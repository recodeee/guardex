'use strict';

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function normalizeStartResult(result) {
  const payload = result && typeof result === 'object' ? result : {};
  const ok = Object.prototype.hasOwnProperty.call(payload, 'ok')
    ? Boolean(payload.ok)
    : true;

  return {
    ok,
    sessionId: firstString(payload.sessionId, payload.session?.id, payload.id),
    branch: firstString(payload.branch, payload.lane?.branch),
    worktreePath: firstString(payload.worktreePath, payload.worktree?.path, payload.path),
    message: firstString(
      payload.message,
      ok ? 'Started agent lane.' : 'Failed to start agent lane.',
    ),
  };
}

function resolveStartImplementation(deps = {}) {
  if (typeof deps.startImplementation === 'function') return deps.startImplementation;
  if (typeof deps.startAgentLane === 'function') return deps.startAgentLane;
  if (typeof deps.startAgent === 'function') return deps.startAgent;

  const startModule = require('../agents/start');
  if (typeof startModule === 'function') return startModule;
  if (typeof startModule.startAgentLane === 'function') return startModule.startAgentLane;
  if (typeof startModule.startAgent === 'function') return startModule.startAgent;
  if (typeof startModule.start === 'function') return startModule.start;

  throw new Error('gx agents start implementation is unavailable');
}

function startAgentLane(options = {}, deps = {}) {
  const request = {
    task: options.task,
    agent: options.agent,
    base: options.base,
    claims: options.claims,
  };
  const startImplementation = resolveStartImplementation(deps);
  const result = startImplementation(request);

  if (result && typeof result.then === 'function') {
    return result.then(normalizeStartResult);
  }

  return normalizeStartResult(result);
}

module.exports = {
  startAgentLane,
  normalizeStartResult,
  resolveStartImplementation,
};

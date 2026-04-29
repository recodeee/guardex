const { test, assert } = require('./helpers/install-test-helpers');
const Module = require('node:module');
const path = require('node:path');

const detectPath = path.resolve(__dirname, '..', 'src', 'agents', 'detect.js');
const registryPath = path.resolve(__dirname, '..', 'src', 'agents', 'registry.js');
const runtimePath = path.resolve(__dirname, '..', 'src', 'core', 'runtime.js');

function withMockedDetection({ registry, run }, fn) {
  const originalLoad = Module._load;
  delete require.cache[detectPath];

  Module._load = function load(request, parent, isMain) {
    if (parent?.filename === detectPath && request === './registry') {
      return registry;
    }
    if (parent?.filename === detectPath && request === '../core/runtime') {
      return { run };
    }

    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === registryPath) {
      return registry;
    }
    if (resolved === runtimePath) {
      return { run };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return fn(require(detectPath));
  } finally {
    delete require.cache[detectPath];
    Module._load = originalLoad;
  }
}

test('detectAgent uses getAgentDefinition for codex registry entries', () => {
  const calls = [];
  const registry = {
    getAgentDefinition: (agentId) => (
      agentId === 'codex'
        ? { id: 'codex', label: 'Codex', detectCommand: ['codex', '--version'] }
        : null
    ),
  };

  withMockedDetection(
    {
      registry,
      run: (cmd, args, options) => {
        calls.push({ cmd, args, options });
        return { status: 0, stdout: 'codex 1.2.3\n', stderr: '' };
      },
    },
    ({ detectAgent }) => {
      assert.deepEqual(detectAgent('codex'), {
        id: 'codex',
        label: 'Codex',
        available: true,
        command: 'codex --version',
        error: null,
      });
    },
  );

  assert.deepEqual(calls, [
    { cmd: 'codex', args: ['--version'], options: { stdio: 'pipe' } },
  ]);
});

test('detectAgent uses resolveAgent for claude registry entries', () => {
  const registry = {
    getAgentDefinition: () => null,
    resolveAgent: (agentId) => {
      if (agentId === 'claude') {
        return { id: 'claude', label: 'Claude Code', detectCommand: 'claude --version' };
      }
      throw new Error(`Unknown agent id: ${agentId}`);
    },
  };

  withMockedDetection(
    {
      registry,
      run: () => ({ status: 0, stdout: 'claude 1.2.3\n', stderr: '' }),
    },
    ({ detectAgent }) => {
      assert.deepEqual(detectAgent('claude'), {
        id: 'claude',
        label: 'Claude Code',
        available: true,
        command: 'claude --version',
        error: null,
      });
    },
  );
});

test('detectAgent reports command failures as unavailable with error text', () => {
  const registry = {
    getAgentDefinition: (agentId) => (
      agentId === 'claude'
        ? { id: 'claude', label: 'Claude', detectCommand: { command: 'claude', args: ['--version'] } }
        : null
    ),
  };

  withMockedDetection(
    {
      registry,
      run: () => ({ status: 127, stdout: '', stderr: 'claude: command not found\n' }),
    },
    ({ detectAgent }) => {
      assert.deepEqual(detectAgent('claude'), {
        id: 'claude',
        label: 'Claude',
        available: false,
        command: 'claude --version',
        error: 'claude: command not found',
      });
    },
  );
});

test('detectAgents with no args returns all registry agents', () => {
  const registry = {
    AGENT_IDS: ['codex', 'claude', 'gemini'],
    getAgentDefinition: (agentId) => ({
      codex: { id: 'codex', label: 'Codex', detectCommand: 'codex --version' },
      claude: { id: 'claude', label: 'Claude', detectCommand: 'claude --version' },
      gemini: { id: 'gemini', label: 'Gemini', detectCommand: 'gemini --version' },
    }[agentId]),
  };

  withMockedDetection(
    {
      registry,
      run: () => ({ status: 0, stdout: '', stderr: '' }),
    },
    ({ detectAgents }) => {
      assert.deepEqual(detectAgents().map((agent) => agent.id), ['codex', 'claude', 'gemini']);
      assert.deepEqual(detectAgents().map((agent) => agent.available), [true, true, true]);
    },
  );
});

test('detectAvailableAgents returns only successful detections', () => {
  const registry = {
    agents: [
      { id: 'codex', label: 'Codex', detectCommand: ['codex', '--version'] },
      { id: 'missing', label: 'Missing', detectCommand: ['missing-agent', '--version'] },
      { id: 'broken', label: 'Broken' },
    ],
  };

  withMockedDetection(
    {
      registry,
      run: (cmd) => ({ status: cmd === 'codex' ? 0 : 127, stdout: '', stderr: '' }),
    },
    ({ detectAvailableAgents }) => {
      assert.deepEqual(detectAvailableAgents(), [
        {
          id: 'codex',
          label: 'Codex',
          available: true,
          command: 'codex --version',
          error: null,
        },
      ]);
    },
  );
});

test('detectAgent reports unknown agents without running commands', () => {
  let callCount = 0;

  withMockedDetection(
    {
      registry: {
        AGENT_IDS: ['codex', 'claude'],
        getAgentDefinition: () => null,
        resolveAgent: () => {
          throw new Error('unknown');
        },
      },
      run: () => {
        callCount += 1;
        return { status: 0, stdout: '', stderr: '' };
      },
    },
    ({ detectAgent }) => {
      assert.deepEqual(detectAgent('ghost'), {
        id: 'ghost',
        label: 'ghost',
        available: false,
        command: null,
        error: 'unknown agent: ghost (known agents: codex, claude)',
      });
    },
  );

  assert.equal(callCount, 0);
});

test('detectAgent reports successful mocked commands as available', () => {
  const registry = {
    getAgentDefinition: (agentId) => (
      agentId === 'codex'
        ? { id: 'codex', label: 'Codex', detectCommand: 'codex --version' }
        : null
    ),
  };

  withMockedDetection(
    {
      registry,
      run: () => ({ status: 0, stdout: 'codex 1.2.3\n', stderr: '' }),
    },
    ({ detectAgent }) => {
      assert.equal(detectAgent('codex').available, true);
    },
  );
});

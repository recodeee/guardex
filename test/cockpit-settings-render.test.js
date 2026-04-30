'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { renderSettingsScreen } = require('../src/cockpit/settings-render');

test('renderSettingsScreen shows settings sections and current values', () => {
  const output = renderSettingsScreen({
    theme: 'dim',
    sidebarWidth: 44,
    refreshMs: 3000,
    defaultAgent: 'claude',
    defaultBase: 'dev',
    showLocks: false,
    showWorktreePaths: true,
    autopilotDefault: true,
    editorCommand: 'code --reuse-window',
  });

  assert.match(output, /gx cockpit settings/);
  assert.match(output, /\[Appearance\]/);
  assert.match(output, /Theme: dim \(available: blue, amber, dim, high-contrast, none\)/);
  assert.match(output, /\[Layout\]/);
  assert.match(output, /Sidebar width: 44 \(available: 20-80 columns\)/);
  assert.match(output, /Refresh interval: 3000 \(available: 500-60000 ms\)/);
  assert.match(output, /Show worktree paths: true \(available: true, false\)/);
  assert.match(output, /\[Agents\]/);
  assert.match(output, /Default agent: claude \(available: codex, claude, opencode, cursor, gemini\)/);
  assert.match(output, /Default base: dev \(available: any branch name\)/);
  assert.match(output, /Autopilot default: true \(available: true, false\)/);
  assert.match(output, /\[Safety\]/);
  assert.match(output, /Show locks: false \(available: true, false\)/);
  assert.match(output, /\[Editor\]/);
  assert.match(output, /Editor command: code --reuse-window \(available: any shell command, blank\)/);
});

test('renderSettingsScreen includes fixed keyboard hints', () => {
  const output = renderSettingsScreen({});

  assert.match(output, /\[Keybindings\]/);
  assert.match(output, /↑\/↓ navigate/);
  assert.match(output, /Enter edit/);
  assert.match(output, /Esc back/);
  assert.match(output, /q quit/);
});

test('renderSettingsScreen uses defaults and can mark the selected setting', () => {
  const output = renderSettingsScreen(null, { selectedField: 'theme' });

  assert.match(output, /> Theme: blue \(available: blue, amber, dim, high-contrast, none\)/);
  assert.match(output, /Editor command: \(blank\) \(available: any shell command, blank\)/);
  assert.equal(output.endsWith('\n'), true);
});

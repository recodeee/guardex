'use strict';

const WELCOME_SHORTCUTS = Object.freeze([
  ['n', 'new agent'],
  ['t', 'terminal'],
  ['s', 'settings'],
  ['?', 'shortcuts'],
  ['q', 'quit'],
]);

const SETTINGS_KEYBINDINGS = Object.freeze([
  '↑/↓ navigate',
  'Enter edit',
  'Esc back',
  'q quit',
]);

const CONTROL_KEY_HELP = 'keys: up/down select  m/Alt+Shift+M menu  v/h/x/p/r/c/o/a/b/f/T/A pane actions  s settings  q quit';

module.exports = {
  CONTROL_KEY_HELP,
  SETTINGS_KEYBINDINGS,
  WELCOME_SHORTCUTS,
};

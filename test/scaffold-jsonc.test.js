const test = require('node:test');
const assert = require('node:assert/strict');

const { parseJsonObjectLikeFile } = require('../src/scaffold');

test('parseJsonObjectLikeFile accepts JSONC comments and trailing commas', () => {
  const parsed = parseJsonObjectLikeFile(
    `{
      // Keep VS Code style comments.
      "folders": [
        "src",
      ],
      "enabled": true,
    }`,
    '.vscode/settings.json',
  );

  assert.deepEqual(parsed, {
    folders: ['src'],
    enabled: true,
  });
});

test('parseJsonObjectLikeFile preserves string content that looks like comment syntax', () => {
  const parsed = parseJsonObjectLikeFile(
    `{
      "url": "https://example.test//keep",
      "pattern": "/* literal */"
    }`,
    '.vscode/settings.json',
  );

  assert.equal(parsed.url, 'https://example.test//keep');
  assert.equal(parsed.pattern, '/* literal */');
});

test('parseJsonObjectLikeFile still rejects invalid JSONC input', () => {
  assert.throws(
    () => parseJsonObjectLikeFile('{ "enabled": true,, }', '.vscode/settings.json'),
    /Unable to parse \.vscode\/settings\.json as JSON or JSONC:/,
  );
});

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseVersionString,
  compareParsedVersions,
  isNewerVersion,
} = require('../src/core/versions');

test('parseVersionString normalizes valid semver strings including prereleases', () => {
  assert.equal(parseVersionString(' v1.2.3-alpha.10 '), '1.2.3-alpha.10');
  assert.equal(parseVersionString('not-a-version'), null);
});

test('compareParsedVersions honors prerelease precedence', () => {
  const alpha2 = parseVersionString('v1.2.3-alpha.2');
  const alpha10 = parseVersionString('v1.2.3-alpha.10');
  const stable = parseVersionString('v1.2.3');

  assert.equal(compareParsedVersions(alpha2, alpha10) < 0, true);
  assert.equal(compareParsedVersions(alpha10, stable) < 0, true);
  assert.equal(compareParsedVersions(stable, alpha10) > 0, true);
});

test('isNewerVersion treats stable releases as newer than matching prereleases', () => {
  assert.equal(isNewerVersion('v1.2.3', 'v1.2.3-alpha.4'), true);
  assert.equal(isNewerVersion('v1.2.3-alpha.4', 'v1.2.3'), false);
  assert.equal(isNewerVersion('v1.2.3-alpha.10', 'v1.2.3-alpha.2'), true);
});

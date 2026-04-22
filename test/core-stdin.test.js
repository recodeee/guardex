const test = require('node:test');
const assert = require('node:assert/strict');

const { readSingleLineFromStdin } = require('../src/core/stdin');

function createReadSyncFromBuffer(source) {
  const bytes = Buffer.from(source, 'utf8');
  let index = 0;

  return {
    fsModule: {
      readSync(_fd, buffer, offset, length) {
        if (index >= bytes.length) {
          return 0;
        }
        const next = bytes.subarray(index, index + length);
        next.copy(buffer, offset);
        index += next.length;
        return next.length;
      },
    },
    getIndex() {
      return index;
    },
    getByteLength() {
      return bytes.length;
    },
  };
}

test('readSingleLineFromStdin preserves multi-byte characters', () => {
  const { fsModule } = createReadSyncFromBuffer('žluťoučký\n');

  const line = readSingleLineFromStdin({
    fsModule,
    input: { fd: 0, isTTY: false },
    sleepSync() {},
  });

  assert.equal(line, 'žluťoučký');
});

test('readSingleLineFromStdin stops at the first newline without overreading later bytes', () => {
  const source = createReadSyncFromBuffer('🌍\nrest of input');

  const line = readSingleLineFromStdin({
    fsModule: source.fsModule,
    input: { fd: 0, isTTY: false },
    sleepSync() {},
  });

  assert.equal(line, '🌍');
  assert.equal(source.getIndex() < source.getByteLength(), true);
});

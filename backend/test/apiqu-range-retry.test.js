const test = require('node:test');
const assert = require('node:assert/strict');

const {
  dedupeErrorsByBookId,
  parseArgs,
} = require('../apiqu-range-retry');

test('dedupeErrorsByBookId 按 bookId 去重并保留最后一条', () => {
  const result = dedupeErrorsByBookId([
    { bookId: 1, error: 'a' },
    { bookId: 2, error: 'b' },
    { bookId: 1, error: 'c' },
  ]);

  assert.deepEqual(result, [
    { bookId: 1, error: 'c' },
    { bookId: 2, error: 'b' },
  ]);
});

test('parseArgs 支持 apiqu 区间补抓参数', () => {
  const options = parseArgs([
    'node',
    'backend/apiqu-range-retry.js',
    '--target',
    'bige7',
    '--limit',
    '500',
    '--concurrency',
    '16',
    '--timeout',
    '20000',
  ]);

  assert.equal(options.target.name, 'bige7');
  assert.equal(options.limit, 500);
  assert.equal(options.concurrency, 16);
  assert.equal(options.timeoutMs, 20000);
  assert.equal(options.outputDir.endsWith('storage/json/bige7'), true);
});

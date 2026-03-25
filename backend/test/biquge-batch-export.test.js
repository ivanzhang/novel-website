const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pickNextBatchBooks,
  parseArgs,
  withStorageBatch,
} = require('../biquge-batch-export');

test('pickNextBatchBooks 从 all 中跳过已有批次后取前 N 本', () => {
  const allBooks = [
    { bookId: 1, title: 'A' },
    { bookId: 2, title: 'B' },
    { bookId: 3, title: 'C' },
    { bookId: 4, title: 'D' },
  ];
  const existingIds = new Set(['1', '3']);

  const result = pickNextBatchBooks(allBooks, existingIds, 2);

  assert.deepEqual(result.map((item) => item.bookId), [2, 4]);
});

test('withStorageBatch 给书 JSON 补 storage_batch', () => {
  const payload = withStorageBatch(
    {
      bookId: 2,
      title: 'B',
      chapterCount: 10,
    },
    'biquge2'
  );

  assert.equal(payload.storage_batch, 'biquge2');
  assert.equal(payload.bookId, 2);
});

test('parseArgs 支持 biquge2 批次导出参数', () => {
  const options = parseArgs([
    'node',
    'backend/biquge-batch-export.js',
    '--source-dir',
    './storage/json/all',
    '--output-dir',
    './storage/json/biquge2',
    '--batch-name',
    'biquge2',
    '--limit',
    '5000',
  ]);

  assert.equal(options.limit, 5000);
  assert.equal(options.batchName, 'biquge2');
  assert.equal(options.sourceDir.endsWith('storage/json/all'), true);
  assert.equal(options.outputDir.endsWith('storage/json/biquge2'), true);
});

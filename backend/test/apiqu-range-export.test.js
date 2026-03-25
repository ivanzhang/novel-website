const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCoverUrl,
  buildBookJsonPath,
  buildCoverPath,
  chunkRange,
  parseArgs,
} = require('../apiqu-range-export');

test('buildCoverUrl 按 bookId 千位规则生成封面地址', () => {
  assert.equal(
    buildCoverUrl('https://www.bqg291.cc', 557),
    'https://www.bqg291.cc/bookimg/0/557.jpg'
  );
  assert.equal(
    buildCoverUrl('https://www.bqg291.cc', 188707),
    'https://www.bqg291.cc/bookimg/188/188707.jpg'
  );
});

test('buildBookJsonPath 和 buildCoverPath 生成输出路径', () => {
  assert.equal(
    buildBookJsonPath('/tmp/out', 123),
    '/tmp/out/books/123.json'
  );
  assert.equal(
    buildCoverPath('/tmp/out', 123),
    '/tmp/out/covers/123.jpg'
  );
});

test('chunkRange 按批次拆分 ID 区间', () => {
  assert.deepEqual(
    chunkRange(1, 10, 4),
    [
      { start: 1, end: 4 },
      { start: 5, end: 8 },
      { start: 9, end: 10 },
    ]
  );
});

test('parseArgs 支持 apiqu 枚举模式参数', () => {
  const options = parseArgs([
    'node',
    'backend/apiqu-range-export.js',
    '--start-id',
    '1',
    '--end-id',
    '200243',
    '--concurrency',
    '24',
    '--batch-size',
    '500',
    '--target',
    'bige7',
  ]);

  assert.equal(options.startId, 1);
  assert.equal(options.endId, 200243);
  assert.equal(options.concurrency, 24);
  assert.equal(options.batchSize, 500);
  assert.equal(options.target.name, 'bige7');
  assert.equal(options.outputDir.endsWith('storage/json/all'), true);
});

test('parseArgs 支持 all 目标站点别名', () => {
  const options = parseArgs([
    'node',
    'backend/apiqu-range-export.js',
    '--target',
    'all',
  ]);

  assert.equal(options.target.name, 'all');
  assert.equal(options.outputDir.endsWith('storage/json/all'), true);
});

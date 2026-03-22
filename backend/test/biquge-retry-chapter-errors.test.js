const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getTargetConfig,
  buildChapterApiUrl,
  buildChapterUrl,
  dedupeChapterErrors,
  normalizeChapterPayload,
  parseArgs,
} = require('../biquge-retry-chapter-errors');

test('buildChapterApiUrl 生成正文接口地址', () => {
  assert.equal(
    buildChapterApiUrl(2530, 1),
    'https://apibi.cc/api/chapter?id=2530&chapterid=1'
  );
});

test('dedupeChapterErrors 会按书和章节去重', () => {
  const deduped = dedupeChapterErrors([
    { bookId: 1, chapterNumber: 2, error: 'a' },
    { bookId: 1, chapterNumber: 2, error: 'b' },
    { bookId: 1, chapterNumber: 3, error: 'c' },
  ]);

  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].error, 'b');
  assert.equal(deduped[1].chapterNumber, 3);
});

test('normalizeChapterPayload 生成单章 JSON 结构', () => {
  const payload = normalizeChapterPayload({
    site: 'https://0732.bqg291.cc',
    apiHost: 'https://apibi.cc',
    target: getTargetConfig('biquge'),
    bookId: 2530,
    chapterNumber: 1,
    chapterApiPayload: {
      chaptername: '第1章 我有三个相宫',
      txt: '正文内容',
    },
    bookTitle: '万相之王',
    author: '天蚕土豆',
    fetchedAt: '2026-03-22T01:00:00.000Z',
  });

  assert.deepEqual(payload, {
    site: 'https://0732.bqg291.cc',
    apiHost: 'https://apibi.cc',
    bookId: 2530,
    bookTitle: '万相之王',
    author: '天蚕土豆',
    chapterNumber: 1,
    title: '第1章 我有三个相宫',
    sourceUrl: 'https://0732.bqg291.cc/book/2530/1.html',
    pageUrls: ['https://apibi.cc/api/chapter?id=2530&chapterid=1'],
    content: '正文内容',
    fetchedAt: '2026-03-22T01:00:00.000Z',
  });
});

test('parseArgs 支持 limit 和并发参数', () => {
  const options = parseArgs([
    'node',
    'backend/biquge-retry-chapter-errors.js',
    '--limit',
    '20',
    '--scan-missing',
    '--concurrency',
    '4',
    '--timeout',
    '20000',
  ]);

  assert.equal(options.limit, 20);
  assert.equal(options.scanMissing, true);
  assert.equal(options.concurrency, 4);
  assert.equal(options.timeoutMs, 20000);
});

test('parseArgs 支持 bige7 目标站点', () => {
  const options = parseArgs([
    'node',
    'backend/biquge-retry-chapter-errors.js',
    '--target',
    'bige7',
  ]);

  assert.equal(options.target.name, 'bige7');
  assert.equal(options.outputDir.endsWith('storage/json/bige7'), true);
});

test('getTargetConfig 返回 bige7 目标配置', () => {
  const target = getTargetConfig('bige7');

  assert.equal(target.name, 'bige7');
  assert.equal(target.site, 'https://www.bqg291.cc');
  assert.equal(target.outputDir.endsWith('storage/json/bige7'), true);
});

test('buildChapterUrl 按目标站生成阅读地址', () => {
  const target = getTargetConfig('bige7');

  assert.equal(
    buildChapterUrl(target, 1371, 1),
    'https://www.bqg291.cc/book/1371/1.html'
  );
});

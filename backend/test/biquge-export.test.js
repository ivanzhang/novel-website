const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getTargetConfig,
  buildCoverUrl,
  buildChapterUrl,
  buildChapterApiUrl,
  dedupeBooksById,
  normalizeBookPayload,
  normalizeChapterPayload,
  parseArgs,
} = require('../biquge-export');

test('buildCoverUrl 应该生成公共封面地址', () => {
  assert.equal(
    buildCoverUrl(getTargetConfig('biquge'), 2530),
    'https://www.bqg291.cc/bookimg/2/2530.jpg'
  );
});

test('buildChapterUrl 应该生成章节阅读地址', () => {
  assert.equal(
    buildChapterUrl(getTargetConfig('biquge'), 2530, 1),
    'https://0732.bqg291.cc/book/2530/1.html'
  );
});

test('buildChapterApiUrl 应该生成正文接口地址', () => {
  assert.equal(
    buildChapterApiUrl(getTargetConfig('biquge'), 2530, 1),
    'https://apibi.cc/api/chapter?id=2530&chapterid=1'
  );
});

test('buildCoverUrl 和 buildChapterUrl 应该按目标站切换', () => {
  const target = getTargetConfig('bige7');

  assert.equal(
    buildCoverUrl(target, 1234),
    'https://www.bqg291.cc/bookimg/1/1234.jpg'
  );
  assert.equal(
    buildChapterUrl(target, 1234, 1),
    'https://www.bqg291.cc/book/1234/1.html'
  );
});

test('normalizeBookPayload 应该规范化详情和章节数据', () => {
  const now = '2026-03-21T18:11:00+08:00';
  const result = normalizeBookPayload({
    target: getTargetConfig('biquge'),
    site: 'https://0732.bqg291.cc',
    bookSummary: {
      id: '2530',
      title: '万相之王',
      author: '天蚕土豆',
      intro: '天地间有万相'
    },
    bookDetail: {
      id: '2530',
      title: '万相之王',
      sortname: '玄幻',
      author: '天蚕土豆',
      full: '连载',
      intro: '天地间有万相',
      lastchapterid: '1836',
      lastchapter: '第一千八百三十七章 大结局',
      lastupdate: '2025-11-15'
    },
    chapterTitles: ['第1章 我有三个相宫', '第二章 不想退婚的未婚妻'],
    fetchedAt: now,
    coverLocalPath: 'storage/json/biquge/covers/2530.jpg'
  });

  assert.equal(result.bookId, 2530);
  assert.equal(result.category, '玄幻');
  assert.equal(result.status, '连载');
  assert.equal(result.chapterCount, 2);
  assert.deepEqual(result.lastChapter, {
    chapterId: 1836,
    title: '第一千八百三十七章 大结局'
  });
  assert.deepEqual(result.chapters[0], {
    chapterNumber: 1,
    title: '第1章 我有三个相宫',
    url: 'https://0732.bqg291.cc/book/2530/1.html'
  });
  assert.equal(result.cover.originalUrl, 'https://www.bqg291.cc/bookimg/2/2530.jpg');
  assert.equal(result.cover.localPath, 'storage/json/biquge/covers/2530.jpg');
  assert.equal(result.fetchedAt, now);
});

test('normalizeChapterPayload 应该规范化章节正文数据', () => {
  const now = '2026-03-21T19:50:00+08:00';
  const result = normalizeChapterPayload({
    target: getTargetConfig('biquge'),
    site: 'https://0732.bqg291.cc',
    apiHost: 'https://apibi.cc',
    bookId: 2530,
    chapterNumber: 1,
    chapterApiPayload: {
      chaptername: '第1章 我有三个相宫',
      txt: '第一段\\n第二段'
    },
    pageUrls: ['https://apibi.cc/api/chapter?id=2530&chapterid=1'],
    bookTitle: '万相之王',
    author: '天蚕土豆',
    fetchedAt: now
  });

  assert.deepEqual(result, {
    site: 'https://0732.bqg291.cc',
    apiHost: 'https://apibi.cc',
    bookId: 2530,
    bookTitle: '万相之王',
    author: '天蚕土豆',
    chapterNumber: 1,
    title: '第1章 我有三个相宫',
    sourceUrl: 'https://0732.bqg291.cc/book/2530/1.html',
    pageUrls: ['https://apibi.cc/api/chapter?id=2530&chapterid=1'],
    content: '第一段\\n第二段',
    fetchedAt: now
  });
});

test('dedupeBooksById 应该按书籍 id 去重并保留首次出现顺序', () => {
  const result = dedupeBooksById([
    { id: '1', title: 'A' },
    { id: '2', title: 'B' },
    { id: '1', title: 'A2' },
    { id: '3', title: 'C' },
  ]);

  assert.deepEqual(result, [
    { id: '1', title: 'A' },
    { id: '2', title: 'B' },
    { id: '3', title: 'C' },
  ]);
});

test('parseArgs 应该支持全站抓取模式', () => {
  const result = parseArgs([
    'node',
    'backend/biquge-export.js',
    '--all-categories',
    '--with-content',
    '--content-concurrency',
    '12'
  ]);

  assert.equal(result.allCategories, true);
  assert.equal(result.withContent, true);
  assert.equal(result.contentConcurrency, 12);
});

test('parseArgs 应该支持 bige7 目标站点', () => {
  const result = parseArgs([
    'node',
    'backend/biquge-export.js',
    '--target',
    'bige7',
    '--all-categories',
  ]);

  assert.equal(result.target.name, 'bige7');
  assert.equal(result.site, 'https://www.bqg291.cc');
  assert.equal(result.sourceApiHost, 'https://apibi.cc');
  assert.equal(result.outputDir.endsWith('storage/json/all'), true);
  assert.deepEqual(result.categories.length > 0, true);
});

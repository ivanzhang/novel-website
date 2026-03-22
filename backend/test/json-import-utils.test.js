const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mapPrimaryCategory,
  buildNovelLookupKey,
  buildChapterFilePath,
  buildContentPreview,
  normalizeBookRecord,
  normalizeChapterRecord,
} = require('../json-import/utils');

test('mapPrimaryCategory 应该轻映射源分类到主分类', () => {
  assert.equal(mapPrimaryCategory('武侠仙侠'), '仙侠');
  assert.equal(mapPrimaryCategory('未知分类'), '未知分类');
});

test('buildNovelLookupKey 应优先使用 bookId', () => {
  assert.equal(
    buildNovelLookupKey({
      bookId: '2530',
      title: '万相之王',
      author: '天蚕土豆',
    }),
    'bookId:2530'
  );
});

test('buildNovelLookupKey 应在没有 bookId 时回退到 title 和 author', () => {
  assert.equal(
    buildNovelLookupKey({
      title: '万相之王 最新章节 无弹窗',
      author: '天蚕土豆著',
    }),
    'titleAuthor:万相之王|天蚕土豆'
  );
});

test('buildChapterFilePath 应生成章节正文的相对路径', () => {
  assert.equal(buildChapterFilePath(2530, 1), 'chapters/2530/1.json');
});

test('buildChapterFilePath 应拒绝非数字书籍标识', () => {
  assert.throws(
    () => buildChapterFilePath('../2530', 1),
    /bookId 必须是数字字符串/
  );
});

test('buildContentPreview 应压缩空白并截断正文摘要', () => {
  assert.equal(
    buildContentPreview(' 第一段\n\n第二段   第三段 '),
    '第一段 第二段 第三段'
  );

  assert.equal(
    buildContentPreview('a'.repeat(130)),
    'a'.repeat(120)
  );
});

test('normalizeBookRecord 应抽取书级元数据并补齐主分类与查找键', () => {
  const result = normalizeBookRecord(
    {
      site: 'https://0732.bqg291.cc',
      bookId: '2530',
      title: '万相之王',
      author: '天蚕土豆',
      category: '武侠仙侠',
      status: '连载',
      intro: '天地间有万相',
      lastUpdate: '2025-11-15',
      lastChapter: {
        chapterId: 1836,
        title: '第一千八百三十七章 大结局',
      },
      cover: {
        originalUrl: 'https://www.bqg291.cc/bookimg/2/2530.jpg',
        localPath: 'storage/json/biquge/covers/2530.jpg',
      },
      chapterCount: 2,
      chapters: [
        { chapterNumber: 1, title: '第1章 我有三个相宫' },
      ],
      fetchedAt: '2026-03-21T18:11:00+08:00',
    }
  );

  assert.deepEqual(result, {
    site: 'https://0732.bqg291.cc',
    bookId: '2530',
    title: '万相之王',
    author: '天蚕土豆',
    category: '武侠仙侠',
    primaryCategory: '仙侠',
    status: '连载',
    intro: '天地间有万相',
    lastUpdate: '2025-11-15',
    lastChapter: {
      chapterId: 1836,
      title: '第一千八百三十七章 大结局',
    },
    cover: {
      originalUrl: 'https://www.bqg291.cc/bookimg/2/2530.jpg',
      localPath: 'storage/json/biquge/covers/2530.jpg',
    },
    chapterCount: 2,
    chapters: [
      { chapterNumber: 1, title: '第1章 我有三个相宫' },
    ],
    fetchedAt: '2026-03-21T18:11:00+08:00',
    lookupKey: 'bookId:2530',
  });
});

test('normalizeChapterRecord 应生成章节相对路径和摘要', () => {
  const result = normalizeChapterRecord(
    {
      site: 'https://0732.bqg291.cc',
      bookId: '2530',
      title: '万相之王',
      author: '天蚕土豆',
    },
    {
      site: 'https://0732.bqg291.cc',
      apiHost: 'https://apibi.cc',
      bookId: '2530',
      bookTitle: '万相之王',
      author: '天蚕土豆',
      chapterNumber: 1,
      title: '第1章 我有三个相宫',
      sourceUrl: 'https://0732.bqg291.cc/book/2530/1.html',
      pageUrls: ['https://apibi.cc/api/chapter?id=2530&chapterid=1'],
      content: '第一段\n第二段',
      fetchedAt: '2026-03-21T19:50:00+08:00',
    }
  );

  assert.deepEqual(result, {
    site: 'https://0732.bqg291.cc',
    apiHost: 'https://apibi.cc',
    bookId: '2530',
    bookTitle: '万相之王',
    author: '天蚕土豆',
    chapterNumber: 1,
    title: '第1章 我有三个相宫',
    sourceUrl: 'https://0732.bqg291.cc/book/2530/1.html',
    pageUrls: ['https://apibi.cc/api/chapter?id=2530&chapterid=1'],
    content: '第一段\n第二段',
    contentPreview: '第一段 第二段',
    contentFilePath: 'chapters/2530/1.json',
    fetchedAt: '2026-03-21T19:50:00+08:00',
  });
});

test('normalizeChapterRecord 应拒绝非法 chapterNumber', () => {
  const baseBook = {
    site: 'https://0732.bqg291.cc',
    bookId: '2530',
    title: '万相之王',
    author: '天蚕土豆',
  };

  assert.throws(
    () => normalizeChapterRecord(baseBook, {
      ...baseBook,
      chapterNumber: undefined,
      title: '第1章 我有三个相宫',
    }),
    /chapterNumber 必须是数字字符串/
  );

  assert.throws(
    () => normalizeChapterRecord(baseBook, {
      ...baseBook,
      chapterNumber: '',
      title: '第1章 我有三个相宫',
    }),
    /chapterNumber 必须是数字字符串/
  );

  assert.throws(
    () => normalizeChapterRecord(baseBook, {
      ...baseBook,
      chapterNumber: null,
      title: '第1章 我有三个相宫',
    }),
    /chapterNumber 必须是数字字符串/
  );

  assert.throws(
    () => normalizeChapterRecord(baseBook, {
      ...baseBook,
      chapterNumber: '01a',
      title: '第1章 我有三个相宫',
    }),
    /chapterNumber 必须是数字字符串/
  );
});

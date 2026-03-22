const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTestDb } = require('./helpers/test-db');

function loadImporter() {
  const importerPath = path.resolve(__dirname, '../import-biquge-json.js');
  delete require.cache[importerPath];
  return require('../import-biquge-json');
}

async function createTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biquge-json-import-'));
  await fs.mkdir(path.join(root, 'books'), { recursive: true });
  await fs.mkdir(path.join(root, 'chapters', '2530'), { recursive: true });
  await fs.mkdir(path.join(root, 'chapters', '9999'), { recursive: true });

  await fs.writeFile(
    path.join(root, 'books', '2530.json'),
    JSON.stringify({
      site: 'https://0732.bqg291.cc',
      bookId: 2530,
      title: '万相之王',
      author: '天蚕土豆',
      category: '玄幻',
      status: '连载',
      intro: '天地间有万相',
      lastUpdate: '2025-11-15',
      lastChapter: { chapterId: 2, title: '第二章' },
      cover: {
        originalUrl: 'https://www.bqg291.cc/bookimg/2/2530.jpg',
        localPath: 'covers/2530.jpg',
      },
      chapterCount: 2,
      chapters: [
        { chapterNumber: 1, title: '第1章 我有三个相宫', url: 'https://0732.bqg291.cc/book/2530/1.html' },
        { chapterNumber: 2, title: '第二章 不想退婚的未婚妻', url: 'https://0732.bqg291.cc/book/2530/2.html' },
      ],
      fetchedAt: '2026-03-21T12:50:38.848Z',
    }, null, 2)
  );

  await fs.writeFile(
    path.join(root, 'chapters', '2530', '1.json'),
    JSON.stringify({
      site: 'https://0732.bqg291.cc',
      apiHost: 'https://apibi.cc',
      bookId: 2530,
      bookTitle: '万相之王',
      author: '天蚕土豆',
      chapterNumber: 1,
      title: '第1章 我有三个相宫',
      sourceUrl: 'https://0732.bqg291.cc/book/2530/1.html',
      pageUrls: ['https://apibi.cc/api/chapter?id=2530&chapterid=1'],
      content: '第一段\n第二段\n第三段',
      fetchedAt: '2026-03-21T19:50:00+08:00',
    }, null, 2)
  );

  await fs.writeFile(
    path.join(root, 'books', '9999.json'),
    JSON.stringify({
      site: 'https://0732.bqg291.cc',
      bookId: 9999,
      title: '新书',
      author: '新作者',
      category: '都市',
      status: '连载',
      intro: '简介',
      lastUpdate: '2026-03-22',
      lastChapter: { chapterId: 1, title: '第一章' },
      cover: {
        originalUrl: 'https://www.bqg291.cc/bookimg/9/9999.jpg',
        localPath: 'covers/9999.jpg',
      },
      chapterCount: 1,
      chapters: [
        { chapterNumber: 1, title: '第一章', url: 'https://0732.bqg291.cc/book/9999/1.html' },
      ],
      fetchedAt: '2026-03-22T08:00:00+08:00',
    }, null, 2)
  );

  await fs.writeFile(
    path.join(root, 'chapters', '9999', '1.json'),
    JSON.stringify({
      site: 'https://0732.bqg291.cc',
      apiHost: 'https://apibi.cc',
      bookId: 9999,
      bookTitle: '新书',
      author: '新作者',
      chapterNumber: 1,
      title: '第一章',
      sourceUrl: 'https://0732.bqg291.cc/book/9999/1.html',
      pageUrls: ['https://apibi.cc/api/chapter?id=9999&chapterid=1'],
      content: '新书正文',
      fetchedAt: '2026-03-22T08:00:00+08:00',
    }, null, 2)
  );

  return root;
}

test('parseArgs 应该支持 --root 指定扫描目录', () => {
  const { parseArgs } = loadImporter();
  const result = parseArgs([
    'node',
    'backend/import-biquge-json.js',
    '--root',
    '/tmp/import-root',
  ]);

  assert.equal(result.root, '/tmp/import-root');
});

test('importBiqugeJson 应该扫描 books 和 chapters、写入摘要并返回统计', async () => {
  const db = createTestDb();
  const root = await createTempRoot();

  try {
    db.prepare(`
      INSERT INTO novels (
        title,
        author,
        content,
        is_premium,
        chapter_count,
        description,
        free_chapters,
        source_site,
        source_book_id,
        source_category,
        primary_category,
        cover_url,
        content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '旧标题',
      '旧作者',
      '',
      0,
      0,
      '',
      0,
      'https://0732.bqg291.cc',
      '2530',
      null,
      null,
      null,
      'json'
    );

    const { importBiqugeJson } = loadImporter();
    const result = await importBiqugeJson({ root });

    assert.deepEqual(result, {
      total: 2,
      added: 1,
      updated: 1,
      failed: 0,
      missingContentFiles: 1,
    });

    const novel2530 = db.prepare(
      'SELECT title, author, chapter_count, content_storage FROM novels WHERE source_book_id = ?'
    ).get('2530');
    assert.equal(novel2530.title, '万相之王');
    assert.equal(novel2530.author, '天蚕土豆');
    assert.equal(novel2530.chapter_count, 2);
    assert.equal(novel2530.content_storage, 'json');

    const chapter2530 = db.prepare(
      'SELECT chapter_number, title, content, content_file_path, content_preview FROM chapters WHERE novel_id = (SELECT id FROM novels WHERE source_book_id = ?) AND chapter_number = ?'
    ).get('2530', 1);
    assert.equal(chapter2530.chapter_number, 1);
    assert.equal(chapter2530.title, '第1章 我有三个相宫');
    assert.equal(chapter2530.content, '');
    assert.equal(chapter2530.content_file_path, 'chapters/2530/1.json');
    assert.equal(chapter2530.content_preview, '第一段 第二段 第三段');

    const chapter9999 = db.prepare(
      'SELECT chapter_number, content_file_path, content_preview FROM chapters WHERE novel_id = (SELECT id FROM novels WHERE source_book_id = ?) AND chapter_number = ?'
    ).get('9999', 1);
    assert.equal(chapter9999.content_file_path, 'chapters/9999/1.json');
    assert.equal(chapter9999.content_preview, '新书正文');
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

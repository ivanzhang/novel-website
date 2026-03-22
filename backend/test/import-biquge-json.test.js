const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTestDb } = require('./helpers/test-db');

function loadImporter() {
  const importerPath = path.resolve(__dirname, '../import-biquge-json.js');
  const repositoryPath = path.resolve(__dirname, '../json-import/repository.js');
  delete require.cache[importerPath];
  delete require.cache[repositoryPath];
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

test('import 脚本默认应把 DB_PATH 固定到 backend/novels.db', () => {
  const previousDbPath = process.env.DB_PATH;

  try {
    delete process.env.DB_PATH;
    loadImporter();
    assert.equal(process.env.DB_PATH, path.resolve(__dirname, '../novels.db'));
  } finally {
    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }
  }
});

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
      'SELECT title, author, chapter_count, content_storage, cover_url FROM novels WHERE source_book_id = ?'
    ).get('2530');
    assert.equal(novel2530.title, '万相之王');
    assert.equal(novel2530.author, '天蚕土豆');
    assert.equal(novel2530.chapter_count, 2);
    assert.equal(novel2530.content_storage, 'json');
    assert.equal(novel2530.cover_url, '/covers/2530.jpg');

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

    const category9999 = db.prepare(
      'SELECT source_category, primary_category FROM novels WHERE source_book_id = ?'
    ).get('9999');
    assert.equal(category9999.source_category, '都市');
    assert.equal(category9999.primary_category, '都市');
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('importBiqugeJson 应该按 chapters 目录扫描章节文件而不是依赖书级章节列表', async () => {
  const db = createTestDb();
  const root = await createTempRoot();

  try {
    const bookPath = path.join(root, 'books', '9999.json');
    const bookJson = JSON.parse(await fs.readFile(bookPath, 'utf8'));
    bookJson.category = '武侠仙侠';
    bookJson.chapterCount = 2;
    bookJson.chapters = [
      { chapterNumber: 1, title: '第一章', url: 'https://0732.bqg291.cc/book/9999/1.html' },
    ];
    await fs.writeFile(bookPath, JSON.stringify(bookJson, null, 2));

    await fs.writeFile(
      path.join(root, 'chapters', '9999', '2.json'),
      JSON.stringify({
        site: 'https://0732.bqg291.cc',
        apiHost: 'https://apibi.cc',
        bookId: 9999,
        bookTitle: '新书',
        author: '新作者',
        chapterNumber: 2,
        title: '第二章',
        sourceUrl: 'https://0732.bqg291.cc/book/9999/2.html',
        pageUrls: ['https://apibi.cc/api/chapter?id=9999&chapterid=2'],
        content: '第二章正文',
        fetchedAt: '2026-03-22T08:10:00+08:00',
      }, null, 2)
    );

    const { importBiqugeJson } = loadImporter();
    const result = await importBiqugeJson({ root });

    assert.deepEqual(result, {
      total: 2,
      added: 2,
      updated: 0,
      failed: 0,
      missingContentFiles: 1,
    });

    const chapters9999 = db.prepare(
      'SELECT chapter_number, title, content_file_path, content_preview FROM chapters WHERE novel_id = (SELECT id FROM novels WHERE source_book_id = ?) ORDER BY chapter_number ASC'
    ).all('9999');

    assert.deepEqual(
      chapters9999.map((chapter) => chapter.chapter_number),
      [1, 2]
    );
    assert.equal(chapters9999[1].title, '第二章');
    assert.equal(chapters9999[1].content_file_path, 'chapters/9999/2.json');
    assert.equal(chapters9999[1].content_preview, '第二章正文');

    const novel9999 = db.prepare(
      'SELECT source_category, primary_category, chapter_count FROM novels WHERE source_book_id = ?'
    ).get('9999');
    assert.equal(novel9999.source_category, '武侠仙侠');
    assert.equal(novel9999.primary_category, '仙侠');
    assert.equal(novel9999.chapter_count, 2);
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('importBiqugeJson 应该把已有章节正文清空并更新文件路径与摘要', async () => {
  const db = createTestDb();
  const root = await createTempRoot();

  try {
    const novelId = db.prepare(`
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
      1,
      '',
      0,
      'https://0732.bqg291.cc',
      '2530',
      null,
      null,
      null,
      'json'
    ).lastInsertRowid;

    db.prepare(`
      INSERT INTO chapters (
        novel_id,
        chapter_number,
        title,
        content,
        is_premium,
        word_count,
        source_chapter_id,
        content_file_path,
        content_preview
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      novelId,
      1,
      '旧章节标题',
      '旧的大正文内容',
      0,
      9,
      null,
      'legacy/1.json',
      '旧摘要'
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

    const chapter2530 = db.prepare(
      'SELECT chapter_number, title, content, content_file_path, content_preview FROM chapters WHERE novel_id = ? AND chapter_number = ?'
    ).get(novelId, 1);

    assert.equal(chapter2530.title, '第1章 我有三个相宫');
    assert.equal(chapter2530.content, '');
    assert.equal(chapter2530.content_file_path, 'chapters/2530/1.json');
    assert.equal(chapter2530.content_preview, '第一段 第二段 第三段');
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

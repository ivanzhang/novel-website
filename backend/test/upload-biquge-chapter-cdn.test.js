const test = require('node:test');
const assert = require('node:assert/strict');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { createTestDb } = require('./helpers/test-db');

const {
  buildChapterMapKey,
  chunkFiles,
  scanChapterFiles,
  removeUploadedLocalFiles,
  uploadGroup,
} = require('../upload-biquge-chapter-cdn');

function loadUploadScript() {
  const modulePath = path.resolve(__dirname, '../upload-biquge-chapter-cdn.js');
  delete require.cache[modulePath];
  return require('../upload-biquge-chapter-cdn');
}

async function createTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-biquge-chapter-cdn-'));
  await fs.mkdir(path.join(root, 'chapters', '2530'), { recursive: true });
  await fs.mkdir(path.join(root, 'chapters', '2531'), { recursive: true });

  await fs.writeFile(
    path.join(root, 'chapters', '2530', '1.json'),
    JSON.stringify({ bookId: 2530, chapterNumber: 1, content: '章节1' }, null, 2)
  );
  await fs.writeFile(
    path.join(root, 'chapters', '2530', '2.json'),
    JSON.stringify({ bookId: 2530, chapterNumber: 2, content: '章节2' }, null, 2)
  );
  await fs.writeFile(
    path.join(root, 'chapters', '2531', '1.json'),
    JSON.stringify({ bookId: 2531, chapterNumber: 1, content: '章节3' }, null, 2)
  );

  return root;
}

test('buildChapterMapKey 应输出稳定的 bookId/chapter.json 键', () => {
  const key = buildChapterMapKey({
    bookId: '2530',
    chapterNumber: 12,
  });

  assert.equal(key, '2530/12.json');
});

test('scanChapterFiles 应扫描章节目录并按 bookId+chapterNumber 排序', async () => {
  const root = await createTempRoot();

  try {
    const files = await scanChapterFiles(path.join(root, 'chapters'));
    assert.deepEqual(
      files.map((item) => `${item.bookId}/${item.chapterNumber}`),
      ['2530/1', '2530/2', '2531/1']
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('chunkFiles 应按 10 个分组', () => {
  const files = Array.from({ length: 25 }, (_, index) => ({ name: `${index + 1}.json` }));
  const groups = chunkFiles(files, 10);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].length, 10);
  assert.equal(groups[1].length, 10);
  assert.equal(groups[2].length, 5);
});

test('syncChapterCdnUrlsToDb 应更新章节 content_cdn_url', () => {
  const db = createTestDb();

  try {
    const { syncChapterCdnUrlsToDb } = loadUploadScript();

    db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, '书A', '作者A', '', 0, 2, '', 0, 'biquge', '2530', '玄幻', '玄幻', null, 'json');

    db.prepare(`
      INSERT INTO chapters (
        novel_id, chapter_number, title, content, is_premium, word_count, content_file_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, '第1章', '', 0, 1000, 'chapters/2530/1.json');

    db.prepare(`
      INSERT INTO chapters (
        novel_id, chapter_number, title, content, is_premium, word_count, content_file_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 2, '第2章', '', 0, 1000, 'chapters/2530/2.json');

    const stats = syncChapterCdnUrlsToDb({
      '2530/1.json': 'https://aixs.us.ci/file/chapter-2530-1.json',
      '2530/2.json': 'https://aixs.us.ci/file/chapter-2530-2.json',
    });

    assert.equal(stats.updated, 2);

    const rows = db.prepare('SELECT chapter_number, content_cdn_url FROM chapters ORDER BY chapter_number').all()
      .map((row) => ({ chapter_number: row.chapter_number, content_cdn_url: row.content_cdn_url }));

    assert.deepEqual(rows, [
      { chapter_number: 1, content_cdn_url: 'https://aixs.us.ci/file/chapter-2530-1.json' },
      { chapter_number: 2, content_cdn_url: 'https://aixs.us.ci/file/chapter-2530-2.json' },
    ]);
  } finally {
    db.close();
  }
});

test('checkpointDatabaseForExternalReaders 应把 WAL 中的 content_cdn_url 刷回主库文件', () => {
  const db = createTestDb();
  const snapshotDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'upload-biquge-chapter-cdn-snapshot-'));

  try {
    const { syncChapterCdnUrlsToDb, checkpointDatabaseForExternalReaders } = loadUploadScript();

    // 先把 schema 刷回主库，避免“外部读取方”连表结构都看不到。
    db.pragma('wal_checkpoint(TRUNCATE)');

    db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, '书A', '作者A', '', 0, 1, '', 0, 'biquge', '2530', '玄幻', '玄幻', null, 'json');

    db.prepare(`
      INSERT INTO chapters (
        novel_id, chapter_number, title, content, is_premium, word_count, content_file_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, '第1章', '', 0, 1000, 'chapters/2530/1.json');

    db.pragma('wal_checkpoint(TRUNCATE)');

    syncChapterCdnUrlsToDb({
      '2530/1.json': 'https://aixs.us.ci/file/chapter-2530-1.json',
    });

    const beforeCheckpointPath = path.join(snapshotDir, 'before-checkpoint.db');
    fsSync.copyFileSync(db.__path, beforeCheckpointPath);
    const detachedBefore = new DatabaseSync(beforeCheckpointPath);
    const beforeRow = detachedBefore.prepare('SELECT content_cdn_url FROM chapters WHERE chapter_number = 1').get();
    detachedBefore.close();

    assert.equal(beforeRow.content_cdn_url, null);

    checkpointDatabaseForExternalReaders();

    const afterCheckpointPath = path.join(snapshotDir, 'after-checkpoint.db');
    fsSync.copyFileSync(db.__path, afterCheckpointPath);
    const detachedAfter = new DatabaseSync(afterCheckpointPath);
    const afterRow = detachedAfter.prepare('SELECT content_cdn_url FROM chapters WHERE chapter_number = 1').get();
    detachedAfter.close();

    assert.equal(afterRow.content_cdn_url, 'https://aixs.us.ci/file/chapter-2530-1.json');
  } finally {
    fsSync.rmSync(snapshotDir, { recursive: true, force: true });
    db.close();
  }
});

test('removeUploadedLocalFiles 只删除已上传成功文件', async () => {
  const root = await createTempRoot();

  try {
    const chaptersRoot = path.join(root, 'chapters');
    await removeUploadedLocalFiles(chaptersRoot, [
      { bookId: '2530', chapterNumber: 1 },
      { bookId: '2531', chapterNumber: 1 },
    ]);

    await assert.rejects(() => fs.access(path.join(root, 'chapters', '2530', '1.json')));
    await assert.rejects(() => fs.access(path.join(root, 'chapters', '2531', '1.json')));
    await fs.access(path.join(root, 'chapters', '2530', '2.json'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('uploadGroup 在请求超时时应快速失败，避免进程长时间挂起', async () => {
  const root = await createTempRoot();
  const originalFetch = global.fetch;
  global.fetch = () => new Promise(() => {});

  try {
    const entry = {
      bookId: '2530',
      chapterNumber: 1,
      key: '2530/1.json',
      name: '2530-1.json',
      path: path.join(root, 'chapters', '2530', '1.json'),
    };

    const result = await Promise.race([
      uploadGroup([entry], 'https://aixs.us.ci/upload', {
        requestTimeoutMs: 30,
        fetchImpl: global.fetch,
      }).then(
        () => 'resolved',
        (error) => `rejected:${error.message}`
      ),
      new Promise((resolve) => {
        setTimeout(() => resolve('pending'), 120);
      }),
    ]);

    assert.match(result, /^rejected:.*timeout/i);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

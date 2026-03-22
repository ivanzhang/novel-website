const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTestDb } = require('./helpers/test-db');

function loadFixScript() {
  const scriptPath = path.resolve(__dirname, '../fix-biquge-cover-paths.js');
  delete require.cache[scriptPath];
  return require('../fix-biquge-cover-paths');
}

async function createTempCoversRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biquge-covers-'));
  await fs.mkdir(path.join(root, 'covers'), { recursive: true });
  return root;
}

test('updateBiqugeCoverPaths 应该只更新本地封面存在的小说', async () => {
  const db = createTestDb();
  const coversRoot = await createTempCoversRoot();

  try {
    await fs.writeFile(path.join(coversRoot, 'covers', '2530.jpg'), 'cover');

    db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '万相之王', '天蚕土豆', '', 0, 1, '', 0,
      'https://0732.bqg291.cc', '2530', '玄幻', '玄幻', 'https://remote/2530.jpg', 'json'
    );

    db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      '缺封面', '作者', '', 0, 1, '', 0,
      'https://0732.bqg291.cc', '9999', '都市', '都市', 'https://remote/9999.jpg', 'json'
    );

    const { updateBiqugeCoverPaths } = loadFixScript();
    const result = await updateBiqugeCoverPaths({ root: coversRoot });

    assert.deepEqual(result, {
      updated: 1,
      skippedMissingFiles: 1,
      skippedWithoutSourceBookId: 0,
    });

    const updated = db.prepare('SELECT source_book_id, cover_url FROM novels ORDER BY source_book_id').all()
      .map((row) => ({
        source_book_id: row.source_book_id,
        cover_url: row.cover_url,
      }));
    assert.deepEqual(updated, [
      { source_book_id: '2530', cover_url: '/covers/2530.jpg' },
      { source_book_id: '9999', cover_url: 'https://remote/9999.jpg' },
    ]);
  } finally {
    db.close();
    await fs.rm(coversRoot, { recursive: true, force: true });
  }
});

test('封面修正脚本默认应把 DB_PATH 固定到 backend/novels.db', () => {
  const previousDbPath = process.env.DB_PATH;

  try {
    delete process.env.DB_PATH;
    loadFixScript();
    assert.equal(process.env.DB_PATH, path.resolve(__dirname, '../novels.db'));
  } finally {
    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }
  }
});

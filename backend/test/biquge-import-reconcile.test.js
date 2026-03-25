const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTestDb } = require('./helpers/test-db');

function loadReconciler() {
  const scriptPath = path.resolve(__dirname, '../biquge-import-reconcile.js');
  delete require.cache[scriptPath];
  return require('../biquge-import-reconcile');
}

async function createTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'biquge-import-reconcile-'));
  await fs.mkdir(path.join(root, 'books'), { recursive: true });

  await fs.writeFile(
    path.join(root, 'books', '2530.json'),
    JSON.stringify({
      site: 'https://0732.bqg291.cc',
      bookId: 2530,
      title: '万相之王',
      author: '天蚕土豆',
      category: '玄幻',
      chapterCount: 1836,
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
      chapterCount: 10,
    }, null, 2)
  );

  await fs.writeFile(
    path.join(root, 'books', 'broken.json'),
    JSON.stringify({
      site: 'https://0732.bqg291.cc',
      title: '缺 bookId 的书',
      author: '匿名',
    }, null, 2)
  );

  return root;
}

test('reconcileBiqugeImport 应该找出未入库的 books 并统计异常 JSON', async () => {
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
      '万相之王',
      '天蚕土豆',
      '',
      0,
      1836,
      '',
      0,
      'https://0732.bqg291.cc',
      '2530',
      '玄幻',
      '玄幻',
      null,
      'json'
    );

    const { reconcileBiqugeImport } = loadReconciler();
    const result = await reconcileBiqugeImport({ root });

    assert.deepEqual(result.summary, {
      totalBookFiles: 3,
      validBookFiles: 2,
      invalidBookFiles: 1,
      importedBooks: 1,
      missingBooks: 1,
      databaseOnlyBooks: 0,
    });

    assert.deepEqual(result.missingBooks, [
      {
        bookId: '9999',
        title: '新书',
        author: '新作者',
        fileName: '9999.json',
        sourceCategory: '都市',
      },
    ]);

    assert.deepEqual(result.invalidBooks, [
      {
        fileName: 'broken.json',
        reason: 'bookId 缺失或为空',
      },
    ]);
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('parseArgs 应该支持 --root 和 --limit', () => {
  const { parseArgs } = loadReconciler();
  const result = parseArgs([
    'node',
    'backend/biquge-import-reconcile.js',
    '--root',
    '/tmp/biquge',
    '--limit',
    '5',
    '--report',
    '/tmp/reconcile-report.json',
  ]);

  assert.equal(result.root, '/tmp/biquge');
  assert.equal(result.limit, 5);
  assert.equal(result.report, '/tmp/reconcile-report.json');
});

test('reconcileBiqugeImport 应支持输出任务报告', async () => {
  const db = createTestDb();
  const root = await createTempRoot();
  const reportPath = path.join(root, 'reports', 'import-jobs', 'reconcile.json');

  try {
    const { reconcileBiqugeImport } = loadReconciler();
    const result = await reconcileBiqugeImport({ root, report: reportPath });
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));

    assert.equal(result.reportPath, reportPath);
    assert.equal(report.task, 'biquge-import-reconcile');
    assert.equal(report.status, 'success');
    assert.equal(report.summary.missingBooks, 2);
    assert.ok(Array.isArray(report.items));
  } finally {
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

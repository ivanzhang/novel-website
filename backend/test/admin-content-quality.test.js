const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createTestDb } = require('./helpers/test-db');

function clearAppModuleCache({ keepDb = false } = {}) {
  for (const relativePath of [
    '../app.js',
    '../seed.js',
    '../auth.js',
    '../routes/admin.js',
    '../routes/novels.js',
    '../routes/auth.js',
    '../routes/user.js',
    '../helpers.js',
    '../chapter-content.js',
    '../chapter-cleaner.js',
    '../novel-sort.js',
    '../seo.js',
  ]) {
    delete require.cache[path.resolve(__dirname, relativePath)];
  }

  if (!keepDb) {
    delete require.cache[path.resolve(__dirname, '../db.js')];
  }
}

test('content quality 接口应返回最新清洗和审查报告摘要', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;
  const previousRoot = process.env.BIQUGE_JSON_ROOT;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'content-quality-'));
  const reportsRoot = path.join(tempRoot, 'reports');

  process.env.JWT_SECRET = 'test-secret';
  process.env.BIQUGE_JSON_ROOT = tempRoot;
  clearAppModuleCache({ keepDb: true });

  let server;

  try {
    await fs.mkdir(path.join(reportsRoot, 'chapter-clean'), { recursive: true });
    await fs.mkdir(path.join(reportsRoot, 'content-audit'), { recursive: true });
    await fs.mkdir(path.join(reportsRoot, 'import-jobs'), { recursive: true });

    await fs.writeFile(
      path.join(reportsRoot, 'chapter-clean', '20260324-180000.json'),
      `${JSON.stringify({
        root: tempRoot,
        mode: 'write',
        summary: {
          books: 1426,
          scanned: 1190933,
          changed: 980200,
          written: 980200,
          unchanged: 210733,
          failed: 0,
        },
        changes: [
          { bookId: '100099', chapterNumber: 1, beforeLength: 6125, afterLength: 4946 },
        ],
        failures: [],
      }, null, 2)}\n`,
      'utf8'
    );

    await fs.writeFile(
      path.join(reportsRoot, 'content-audit', '2026-03-24-audit.json'),
      `${JSON.stringify({
        root: tempRoot,
        checks: ['missing-files', 'content-quality', 'preview', 'short-content'],
        summary: {
          scanned: 4278,
          missingFiles: 0,
          contentQuality: 0,
          preview: 12,
          shortContent: 3,
          dbDisk: 0,
        },
        issues: [
          { bookId: '100099', chapterNumber: 8, previewIssue: true },
        ],
      }, null, 2)}\n`,
      'utf8'
    );

    await fs.writeFile(
      path.join(reportsRoot, 'import-jobs', '2026-03-24-import-biquge-json.json'),
      `${JSON.stringify({
        task: 'import-biquge-json',
        status: 'success',
        summary: {
          scannedBooks: 1426,
          importedBooks: 12,
          updatedBooks: 8,
          failedBooks: 0,
        },
        items: [
          { bookId: '100099', title: '测试书 1', action: 'updated' },
        ],
      }, null, 2)}\n`,
      'utf8'
    );

    await fs.writeFile(
      path.join(reportsRoot, 'import-jobs', '2026-03-24-upload-telegraph-batch.json'),
      `${JSON.stringify({
        task: 'upload-telegraph-batch',
        status: 'success',
        summary: {
          uploaded: 240,
          failed: 0,
          total: 240,
        },
        items: [
          { file: '100099/1.html', status: 'uploaded' },
        ],
      }, null, 2)}\n`,
      'utf8'
    );

    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/admin/content-quality`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.clean.latest.summary.written, 980200);
    assert.equal(payload.audit.latest.summary.contentQuality, 0);
    assert.equal(payload.clean.latest.samples.length, 1);
    assert.equal(payload.audit.latest.samples.length, 1);
    assert.equal(payload.tasks.latest.length, 2);
    assert.equal(payload.tasks.latest[0].task, 'upload-telegraph-batch');
    assert.equal(payload.tasks.latest[1].task, 'import-biquge-json');
    assert.equal(payload.tasks.latest[1].samples.length, 1);
    assert.match(payload.clean.latest.filename, /20260324-180000/);
    assert.match(payload.audit.latest.filename, /2026-03-24-audit/);
  } finally {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }

    clearAppModuleCache();

    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }

    if (previousRoot === undefined) {
      delete process.env.BIQUGE_JSON_ROOT;
    } else {
      process.env.BIQUGE_JSON_ROOT = previousRoot;
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
    db.close();
  }
});

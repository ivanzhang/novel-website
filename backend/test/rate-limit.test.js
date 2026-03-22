const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const { createTestDb } = require('./helpers/test-db');

function clearAppModuleCache() {
  for (const relativePath of [
    '../app.js',
    '../db.js',
    '../seed.js',
    '../auth.js',
    '../routes/novels.js',
    '../routes/auth.js',
    '../routes/user.js',
    '../helpers.js',
    '../chapter-content.js',
    '../chapter-cleaner.js',
    '../novel-sort.js',
  ]) {
    delete require.cache[path.resolve(__dirname, relativePath)];
  }
}

test('公开 GET 接口在本地浏览测试中不应被全局限流拦住', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache();

  let server;

  try {
    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    let lastStatus = 200;

    for (let i = 0; i < 110; i += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      lastStatus = response.status;
    }

    assert.equal(lastStatus, 200);
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

    db.close();
  }
});

test('阅读进度保存接口不应被全局限流拦住', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache();

  let server;

  try {
    db.prepare('INSERT INTO users (id, username, password) VALUES (?, ?, ?)').run(1, 'tester', 'hashed');
    db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, '测试书', '作者', '', 0, 1, '', 0, 'site', '1', '玄幻', '玄幻', '/covers/1.jpg', 'json');
    db.prepare(`
      INSERT INTO chapters (
        id, novel_id, chapter_number, title, content, is_premium, word_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(1, 1, 1, '第一章', '正文', 0, 2);

    const token = jwt.sign({ id: 1, username: 'tester' }, 'test-secret', { expiresIn: '7d' });

    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    let saw429 = false;

    for (let i = 0; i < 110; i += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/api/reading-progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          novel_id: 1,
          chapter_id: 1,
          scroll_position: i,
          reading_time: 1,
        }),
      });
      if (response.status === 429) {
        saw429 = true;
      }
    }

    assert.equal(saw429, false);
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

    db.close();
  }
});

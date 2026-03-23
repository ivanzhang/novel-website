const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

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
    '../seo.js',
  ]) {
    delete require.cache[path.resolve(__dirname, relativePath)];
  }
}

test('根路径应返回前端首页 HTML', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache();

  let server;

  try {
    const { createApp } = require(path.resolve(__dirname, '../app.js'));
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/html/);
    assert.match(html, /中文小说阅读网/);
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

test('favicon.ico 应返回可用的站点图标而不是 404', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache();

  let server;

  try {
    const { createApp } = require(path.resolve(__dirname, '../app.js'));
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/favicon.ico`, {
      redirect: 'manual',
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/favicon.svg');
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

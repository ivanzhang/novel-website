const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createTestDb } = require('./helpers/test-db');

test('根路径应返回前端首页 HTML', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;
  const appModulePath = path.resolve(__dirname, '../app.js');

  process.env.JWT_SECRET = 'test-secret';
  delete require.cache[appModulePath];

  let server;

  try {
    const { createApp } = require(appModulePath);
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

    delete require.cache[appModulePath];

    if (previousSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = previousSecret;
    }

    db.close();
  }
});

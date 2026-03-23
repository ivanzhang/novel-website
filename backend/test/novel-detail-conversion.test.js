const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createTestDb } = require('./helpers/test-db');

function clearAppModuleCache({ keepDb = false } = {}) {
  for (const relativePath of [
    '../app.js',
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

  if (!keepDb) {
    delete require.cache[path.resolve(__dirname, '../db.js')];
  }
}

test('recommendations 接口应返回同分类热门小说且排除当前小说', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache({ keepDb: true });

  let server;

  try {
    const insertNovel = db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        created_at, source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertNovel.run(10, '当前书', '作者甲', '', 1, 150, '当前书描述', 5, '2026-03-18 00:00:00', 'biquge', '10', '玄幻', '玄幻', '/covers/10.jpg', 'json');
    insertNovel.run(11, '玄幻热门一', '作者乙', '', 0, 900, '描述一', 0, '2026-03-22 00:00:00', 'biquge', '11', '玄幻', '玄幻', '/covers/11.jpg', 'json');
    insertNovel.run(12, '玄幻热门二', '作者丙', '', 0, 500, '描述二', 0, '2026-03-20 00:00:00', 'biquge', '12', '玄幻', '玄幻', '/covers/12.jpg', 'json');
    insertNovel.run(13, '玄幻无封面', '作者丁', '', 0, 300, '描述三', 0, '2026-03-21 00:00:00', 'biquge', '13', '玄幻', '玄幻', '', 'json');
    insertNovel.run(14, '都市书', '作者戊', '', 0, 1200, '都市描述', 0, '2026-03-22 00:00:00', 'biquge', '14', '都市', '都市', '/covers/14.jpg', 'json');

    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/novels/10/recommendations`);

    assert.equal(response.status, 200);

    const payload = await response.json();

    assert.equal(payload.novel_id, 10);
    assert.equal(payload.recommendations.length, 3);
    assert.deepEqual(
      payload.recommendations.map((novel) => novel.id),
      [11, 12, 13]
    );
    assert.equal(payload.recommendations.some((novel) => novel.id === 10), false);
    assert.equal(payload.recommendations.some((novel) => novel.primary_category !== '玄幻'), false);
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

test('novel 详情页脚本应包含首屏转化区、目录预览和同类推荐容器', async () => {
  const html = require('node:fs').readFileSync(
    path.resolve(__dirname, '../../frontend/novel.html'),
    'utf8'
  );

  assert.match(html, /novel-hero-actions/);
  assert.match(html, /novel-reading-hint/);
  assert.match(html, /chapter-preview/);
  assert.match(html, /recommendationsSection/);
  assert.match(html, /loadRecommendations/);
});

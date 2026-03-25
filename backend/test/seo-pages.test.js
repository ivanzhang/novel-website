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
  ]) {
    delete require.cache[path.resolve(__dirname, relativePath)];
  }

  if (!keepDb) {
    delete require.cache[path.resolve(__dirname, '../db.js')];
  }
}

test('novel 详情页应在首屏 HTML 输出 SEO 标题、描述、canonical 和结构化数据', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache({ keepDb: true });

  let server;

  try {
    db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        created_at, source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      1076,
      '万相之王',
      '天蚕土豆',
      '',
      1,
      1200,
      '天地间，有万相。而我李洛，终将成为这万相之王。',
      5,
      '2026-03-20 00:00:00',
      'biquge',
      '1076',
      '玄幻',
      '玄幻',
      '/covers/1076.jpg',
      'json'
    );

    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/novel.html?id=1076`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<title>万相之王.*天蚕土豆.*在线阅读.*中文小说阅读网<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]*万相之王[^"]*天蚕土豆[^"]*玄幻[^"]*1200章[^"]*"/);
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/novel\.html\?id=1076">/);
    assert.match(html, /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/covers\/1076\.jpg">/);
    assert.match(html, /"@type":"Book"/);
    assert.match(html, /"name":"万相之王"/);
    assert.match(html, /"author":\{"@type":"Person","name":"天蚕土豆"\}/);
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

test('novel SEO 在 cover_url 为绝对 CDN 地址时不应重复拼接站点域名', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache({ keepDb: true });

  let server;

  try {
    db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        created_at, source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      2088,
      '测试 CDN 封面',
      '作者甲',
      '',
      0,
      100,
      '测试简介',
      0,
      '2026-03-24 00:00:00',
      'biquge',
      '2088',
      '玄幻',
      '玄幻',
      'https://aixs.us.ci/file/cdn-2088.jpg',
      'json'
    );

    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/novel.html?id=2088`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<meta property="og:image" content="https:\/\/aixs\.us\.ci\/file\/cdn-2088\.jpg">/);
    assert.match(html, /"image":"https:\/\/aixs\.us\.ci\/file\/cdn-2088\.jpg"/);
    assert.doesNotMatch(html, /127\.0\.0\.1:\d+https:\/\/aixs\.us\.ci\/file\/cdn-2088\.jpg/);
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

test('robots.txt 应暴露 sitemap 并屏蔽登录与会员中心页面', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache({ keepDb: true });

  let server;

  try {
    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/robots.txt`);
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /text\/plain/);
    assert.match(text, /Disallow: \/membership\.html/);
    assert.match(text, /Disallow: \/login\.html/);
    assert.match(text, new RegExp(`Sitemap: http://127\\.0\\.0\\.1:${port}/sitemap\\.xml`));
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

test('sitemap.xml 应返回 sitemap index，子 sitemap 包含对应 URL', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache({ keepDb: true });

  let server;

  try {
    const insert = db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        created_at, source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(1, '玄幻一', '作者A', '', 0, 12, '描述', 0, '2026-03-21 00:00:00', 'biquge', '1', '玄幻', '玄幻', '/covers/1.jpg', 'json');
    insert.run(2, '都市一', '作者B', '', 0, 10, '描述', 0, '2026-03-21 00:00:00', 'biquge', '2', '都市', '都市', '/covers/2.jpg', 'json');

    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    // sitemap index
    const indexRes = await fetch(`${base}/sitemap.xml`);
    const indexXml = await indexRes.text();
    assert.equal(indexRes.status, 200);
    assert.match(indexRes.headers.get('content-type') || '', /xml/);
    assert.match(indexXml, /sitemapindex/);
    assert.match(indexXml, /sitemaps\/static\.xml/);
    assert.match(indexXml, /sitemaps\/novels-1\.xml/);

    // static sitemap
    const staticRes = await fetch(`${base}/sitemaps/static.xml`);
    const staticXml = await staticRes.text();
    assert.equal(staticRes.status, 200);
    assert.match(staticXml, new RegExp(`<loc>${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/</loc>`));
    assert.match(staticXml, /category=玄幻/);
    assert.match(staticXml, /categories\.html/);
    assert.match(staticXml, /rankings\.html/);

    // novels sitemap
    const novelsRes = await fetch(`${base}/sitemaps/novels-1.xml`);
    const novelsXml = await novelsRes.text();
    assert.equal(novelsRes.status, 200);
    assert.match(novelsXml, /novel\.html\?id=1/);
    assert.match(novelsXml, /novel\.html\?id=2/);
    assert.match(novelsXml, /<lastmod>2026-03-21<\/lastmod>/);

    // 不存在的分页应返回 404
    const notFoundRes = await fetch(`${base}/sitemaps/novels-999.xml`);
    assert.equal(notFoundRes.status, 404);
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

test('分类页应在首屏 HTML 输出分类 SEO 信息和可见导语区', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache({ keepDb: true });

  let server;

  try {
    const insert = db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        created_at, source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(3, '玄幻热书', '作者甲', '', 0, 300, '描述', 0, '2026-03-21 00:00:00', 'biquge', '3', '玄幻', '玄幻', '/covers/3.jpg', 'json');

    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/index.html?category=玄幻`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<title>玄幻小说在线阅读.*热门玄幻小说推荐.*中文小说阅读网<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]*玄幻[^"]*1 本[^"]*"/);
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/index\.html\?category=玄幻">/);
    assert.match(html, /category-intro/);
    assert.match(html, /玄幻频道热门作品/);
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

test('高价值搜索意图词应映射到分类页 SEO 变体且 canonical 仍收敛到分类页', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache({ keepDb: true });

  let server;

  try {
    const insert = db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        created_at, source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(9, '玄幻精选', '作者乙', '', 0, 88, '描述', 0, '2026-03-21 00:00:00', 'biquge', '9', '玄幻', '玄幻', '/covers/9.jpg', 'json');

    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/index.html?category=玄幻&q=玄幻小说大全`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /<title>玄幻小说大全.*热门玄幻小说.*中文小说阅读网<\/title>/);
    assert.match(html, /<meta name="description" content="[^"]*玄幻小说大全[^"]*"/);
    assert.match(html, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:\d+\/index\.html\?category=玄幻">/);
    assert.doesNotMatch(html, /canonical" href="[^"]*q=玄幻小说大全/);
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

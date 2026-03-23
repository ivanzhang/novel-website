const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const jwt = require('jsonwebtoken');

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

test('member center 接口应返回会员状态、统计、最近阅读和套餐信息', async () => {
  const db = createTestDb();
  const previousSecret = process.env.JWT_SECRET;

  process.env.JWT_SECRET = 'test-secret';
  clearAppModuleCache({ keepDb: true });

  let server;

  try {
    db.prepare(`
      INSERT INTO users (id, username, password, is_member, member_expire)
      VALUES (?, ?, ?, ?, ?)
    `).run(7, 'reader7', 'hashed', 1, '2030-03-31T00:00:00.000Z');

    db.prepare(`
      INSERT INTO novels (
        id, title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, '剑来', '烽火戏诸侯', '', 1, 100, '雪中之后', 3, 'biquge', '1001', '玄幻', '玄幻', '/covers/1001.jpg', 'json');

    db.prepare(`
      INSERT INTO chapters (
        id, novel_id, chapter_number, title, content, is_premium, word_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(11, 1, 8, '山中有客', '', 0, 3200);

    db.prepare(`
      INSERT INTO reading_progress (
        user_id, novel_id, chapter_id, scroll_position, reading_time, last_read_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(7, 1, 11, 128, 5400, '2026-03-22 10:00:00');

    const token = jwt.sign({ id: 7, username: 'reader7' }, 'test-secret', { expiresIn: '7d' });

    const { createApp } = require('../app');
    const app = createApp();

    server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });

    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/member-center`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.status, 200);

    const payload = await response.json();

    assert.equal(payload.profile.username, 'reader7');
    assert.equal(payload.profile.is_member, 1);
    assert.equal(payload.profile.member_level, '黄金会员');
    assert.equal(payload.profile.days_remaining > 0, true);
    assert.match(payload.profile.status_text, /有效|会员/);
    assert.equal(payload.profile.benefit_count, payload.benefits.length);

    assert.deepEqual(payload.stats, {
      total_time: 5400,
      novels_read: 1,
      total_sessions: 1,
    });

    assert.equal(payload.recent_reads.length, 1);
    assert.equal(payload.recent_reads[0].novel_title, '剑来');
    assert.equal(payload.recent_reads[0].chapter_number, 8);

    assert.equal(payload.plans.length, 3);
    assert.equal(payload.plans[0].months, 1);
    assert.equal(payload.benefits.length > 0, true);
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

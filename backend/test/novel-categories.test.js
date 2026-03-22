const test = require('node:test');
const assert = require('node:assert/strict');

const { createTestDb } = require('./helpers/test-db');

test('novels 列表查询应支持按 primary_category 过滤并返回正确总数', () => {
  const db = createTestDb();

  try {
    const insert = db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('玄幻一', '作者A', '', 0, 10, '', 0, 'site', '1', '玄幻', '玄幻', '/covers/1.jpg', 'json');
    insert.run('玄幻二', '作者B', '', 0, 10, '', 0, 'site', '2', '玄幻', '玄幻', '/covers/2.jpg', 'json');
    insert.run('都市一', '作者C', '', 0, 10, '', 0, 'site', '3', '都市', '都市', '/covers/3.jpg', 'json');

    const category = '玄幻';
    const total = db.prepare('SELECT COUNT(*) as count FROM novels WHERE primary_category = ?').get(category).count;
    const novels = db.prepare(`
      SELECT id, title, primary_category
      FROM novels
      WHERE primary_category = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(category, 20, 0);

    assert.equal(total, 2);
    assert.deepEqual(novels.map((novel) => novel.title).sort(), ['玄幻一', '玄幻二']);
  } finally {
    db.close();
  }
});

test('novel categories 聚合应按数据库现有 primary_category 动态生成', () => {
  const db = createTestDb();

  try {
    const insert = db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('玄幻一', '作者A', '', 0, 10, '', 0, 'site', '1', '玄幻', '玄幻', '/covers/1.jpg', 'json');
    insert.run('玄幻二', '作者B', '', 0, 10, '', 0, 'site', '2', '玄幻', '玄幻', '/covers/2.jpg', 'json');
    insert.run('都市一', '作者C', '', 0, 10, '', 0, 'site', '3', '都市', '都市', '/covers/3.jpg', 'json');
    insert.run('未分类', '作者D', '', 0, 10, '', 0, 'site', '4', '未知', null, '/covers/4.jpg', 'json');

    const rows = db.prepare(`
      SELECT primary_category, COUNT(*) as count
      FROM novels
      WHERE primary_category IS NOT NULL AND TRIM(primary_category) != ''
      GROUP BY primary_category
      ORDER BY count DESC, primary_category ASC
    `).all();

    assert.deepEqual(rows.map((row) => ({
      primary_category: row.primary_category,
      count: row.count,
    })), [
      { primary_category: '玄幻', count: 2 },
      { primary_category: '都市', count: 1 },
    ]);
  } finally {
    db.close();
  }
});

test('search 查询应支持在当前分类内搜索标题和作者', () => {
  const db = createTestDb();

  try {
    const insert = db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('玄幻战神', '作者A', '', 0, 10, '', 0, 'site', '1', '玄幻', '玄幻', '/covers/1.jpg', 'json');
    insert.run('都市战神', '作者B', '', 0, 10, '', 0, 'site', '2', '都市', '都市', '/covers/2.jpg', 'json');
    insert.run('修仙异闻录', '战神作者', '', 0, 10, '', 0, 'site', '3', '玄幻', '玄幻', '/covers/3.jpg', 'json');

    const searchTerm = '%战神%';
    const results = db.prepare(`
      SELECT title
      FROM novels
      WHERE primary_category = ?
        AND (title LIKE ? OR author LIKE ?)
      ORDER BY
        CASE
          WHEN title LIKE ? THEN 1
          WHEN author LIKE ? THEN 2
          ELSE 3
        END,
        created_at DESC
      LIMIT 20
    `).all('玄幻', searchTerm, searchTerm, '战神%', '战神%');

    assert.deepEqual(results.map((row) => row.title), ['修仙异闻录', '玄幻战神']);
  } finally {
    db.close();
  }
});

test('novels 列表应支持 popular 和 newest 排序', () => {
  const db = createTestDb();

  try {
    const insert = db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        created_at, source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('老牌热门书', '作者A', '', 0, 900, '完整简介', 0, '2026-03-01 00:00:00', 'site', '1', '玄幻', '玄幻', '/covers/1.jpg', 'json');
    insert.run('新书但不完整', '作者B', '', 0, 20, '', 0, '2026-03-21 00:00:00', 'site', '2', '玄幻', '', '', 'json');
    insert.run('中等成品书', '作者C', '', 0, 300, '有简介', 0, '2026-03-10 00:00:00', 'site', '3', '玄幻', '玄幻', '/covers/3.jpg', 'json');

    const popular = db.prepare(`
      SELECT title
      FROM novels
      ORDER BY
        (
          MIN(chapter_count, 800)
          + CASE WHEN cover_url IS NOT NULL AND TRIM(cover_url) != '' THEN 80 ELSE 0 END
          + CASE WHEN description IS NOT NULL AND TRIM(description) != '' THEN 60 ELSE 0 END
          + CASE WHEN primary_category IS NOT NULL AND TRIM(primary_category) != '' THEN 40 ELSE 0 END
          + MIN(30, CAST(julianday(created_at) - julianday('2026-02-20 00:00:00') AS INTEGER))
        ) DESC,
        created_at DESC,
        id DESC
    `).all();

    const newest = db.prepare(`
      SELECT title
      FROM novels
      ORDER BY created_at DESC, id DESC
    `).all();

    assert.deepEqual(popular.map((row) => row.title), ['老牌热门书', '中等成品书', '新书但不完整']);
    assert.deepEqual(newest.map((row) => row.title), ['新书但不完整', '中等成品书', '老牌热门书']);
  } finally {
    db.close();
  }
});

test('search 查询在相关性相同时应按热门程度排序', () => {
  const db = createTestDb();

  try {
    const insert = db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        created_at, source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run('战神归来甲', '作者A', '', 0, 50, '', 0, '2026-03-21 00:00:00', 'site', '1', '都市', '都市', '', 'json');
    insert.run('战神归来乙', '作者B', '', 0, 500, '完整简介', 0, '2026-03-10 00:00:00', 'site', '2', '都市', '都市', '/covers/2.jpg', 'json');

    const results = db.prepare(`
      SELECT title
      FROM novels
      WHERE title LIKE ? OR author LIKE ?
      ORDER BY
        CASE
          WHEN title LIKE ? THEN 1
          WHEN author LIKE ? THEN 2
          ELSE 3
        END,
        (
          MIN(chapter_count, 800)
          + CASE WHEN cover_url IS NOT NULL AND TRIM(cover_url) != '' THEN 80 ELSE 0 END
          + CASE WHEN description IS NOT NULL AND TRIM(description) != '' THEN 60 ELSE 0 END
          + CASE WHEN primary_category IS NOT NULL AND TRIM(primary_category) != '' THEN 40 ELSE 0 END
          + MIN(30, CAST(julianday(created_at) - julianday('2026-02-20 00:00:00') AS INTEGER))
        ) DESC,
        created_at DESC,
        id DESC
      LIMIT 20
    `).all('%战神%', '%战神%', '战神%', '战神%');

    assert.deepEqual(results.map((row) => row.title), ['战神归来乙', '战神归来甲']);
  } finally {
    db.close();
  }
});

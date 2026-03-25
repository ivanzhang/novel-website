const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestDb } = require('./helpers/test-db');

const {
  applyCoverCdn,
  buildBookCoverMap,
  pickBookFilesToUpdate,
  updateNovelCoverUrlsWithMap,
} = require('../update-biquge-cover-cdn');

test('applyCoverCdn 只补充 cover.cdnUrl 并保留原字段', () => {
  const original = {
    bookId: 557,
    title: '测试书',
    cover: {
      originalUrl: 'https://www.bqg291.cc/bookimg/0/557.jpg',
      localPath: 'storage/json/biquge/covers/557.jpg',
    },
  };

  const updated = applyCoverCdn(original, 'https://aixs.us.ci/file/demo.jpg');

  assert.equal(updated.cover.cdnUrl, 'https://aixs.us.ci/file/demo.jpg');
  assert.equal(updated.cover.originalUrl, original.cover.originalUrl);
  assert.equal(updated.cover.localPath, original.cover.localPath);
});

test('buildBookCoverMap 将 bookId 映射到 cdnUrl', () => {
  const map = buildBookCoverMap({
    '557.jpg': 'https://aixs.us.ci/file/557.jpg',
    '713.jpg': 'https://aixs.us.ci/file/713.jpg',
  });

  assert.deepEqual(map, {
    '557': 'https://aixs.us.ci/file/557.jpg',
    '713': 'https://aixs.us.ci/file/713.jpg',
  });
});

test('pickBookFilesToUpdate 只挑选映射中存在的 bookId', () => {
  const files = ['100099.json', '10013.json', '100395.json'];
  const selected = pickBookFilesToUpdate(files, {
    '100099': 'https://aixs.us.ci/file/100099.jpg',
    '100395': 'https://aixs.us.ci/file/100395.jpg',
  }, 1);

  assert.deepEqual(selected, ['100099.json']);
});

test('updateNovelCoverUrlsWithMap 应把数据库中的本地封面路径替换为 CDN URL', () => {
  const db = createTestDb();

  try {
    db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('书A', '作者A', '', 0, 1, '', 0, 'biquge', '557', '玄幻', '玄幻', '/covers/557.jpg', 'json');

    db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('书B', '作者B', '', 0, 1, '', 0, 'biquge', '713', '都市', '都市', '/covers/713.jpg', 'json');

    db.prepare(`
      INSERT INTO novels (
        title, author, content, is_premium, chapter_count, description, free_chapters,
        source_site, source_book_id, source_category, primary_category, cover_url, content_storage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('书C', '作者C', '', 0, 1, '', 0, 'biquge', '999', '历史', '历史', '/covers/999.jpg', 'json');

    const result = updateNovelCoverUrlsWithMap({
      '557': 'https://aixs.us.ci/file/557.jpg',
      '713': 'https://aixs.us.ci/file/713.jpg',
    });

    assert.equal(result.updated, 2);

    const rows = db.prepare('SELECT source_book_id, cover_url FROM novels ORDER BY source_book_id').all()
      .map((row) => ({
        source_book_id: row.source_book_id,
        cover_url: row.cover_url,
      }));
    assert.deepEqual(rows, [
      { source_book_id: '557', cover_url: 'https://aixs.us.ci/file/557.jpg' },
      { source_book_id: '713', cover_url: 'https://aixs.us.ci/file/713.jpg' },
      { source_book_id: '999', cover_url: '/covers/999.jpg' },
    ]);
  } finally {
    db.close();
  }
});

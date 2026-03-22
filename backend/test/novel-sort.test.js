const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeNovelSort,
  buildNovelOrderClause,
  buildSearchOrderClause,
} = require('../novel-sort');

test('normalizeNovelSort 应默认返回 popular 并识别 newest', () => {
  assert.equal(normalizeNovelSort(undefined), 'popular');
  assert.equal(normalizeNovelSort(''), 'popular');
  assert.equal(normalizeNovelSort('popular'), 'popular');
  assert.equal(normalizeNovelSort('newest'), 'newest');
  assert.equal(normalizeNovelSort('weird'), 'popular');
});

test('buildNovelOrderClause 应为 popular 和 newest 返回不同排序 SQL', () => {
  const popularClause = buildNovelOrderClause('popular');
  const newestClause = buildNovelOrderClause('newest');

  assert.match(popularClause, /MIN\(chapter_count, 800\)/);
  assert.match(popularClause, /cover_url/);
  assert.match(popularClause, /created_at DESC/);
  assert.equal(newestClause, 'created_at DESC, id DESC');
});

test('buildSearchOrderClause 应保持相关性优先并在同分时接入热门排序', () => {
  const clause = buildSearchOrderClause('popular');

  assert.match(clause, /CASE\s+WHEN title LIKE \? THEN 1/s);
  assert.match(clause, /MIN\(chapter_count, 800\)/);
  assert.match(clause, /created_at DESC,\s+id DESC/);
});

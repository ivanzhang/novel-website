function normalizeNovelSort(sort) {
  return sort === 'newest' ? 'newest' : 'popular';
}

function buildPopularityScoreSql() {
  return `(
    MIN(chapter_count, 800)
    + CASE WHEN cover_url IS NOT NULL AND TRIM(cover_url) != '' THEN 80 ELSE 0 END
    + CASE WHEN description IS NOT NULL AND TRIM(description) != '' THEN 60 ELSE 0 END
    + CASE WHEN primary_category IS NOT NULL AND TRIM(primary_category) != '' THEN 40 ELSE 0 END
    + MAX(0, 30 - MIN(30, CAST(julianday('now') - julianday(created_at) AS INTEGER)))
  )`;
}

function buildNovelOrderClause(sort) {
  if (normalizeNovelSort(sort) === 'newest') {
    return 'created_at DESC, id DESC';
  }

  return `${buildPopularityScoreSql()} DESC, created_at DESC, id DESC`;
}

function buildSearchOrderClause(sort) {
  return `
    CASE
      WHEN title LIKE ? THEN 1
      WHEN author LIKE ? THEN 2
      ELSE 3
    END,
    ${buildNovelOrderClause(sort)}
  `.trim();
}

module.exports = {
  normalizeNovelSort,
  buildPopularityScoreSql,
  buildNovelOrderClause,
  buildSearchOrderClause,
};

const db = require('../db');
const { normalizeTitle, normalizeAuthor } = require('../admin/import-utils');

function toText(value) {
  return value == null ? '' : String(value);
}

function trimText(value) {
  return toText(value).trim();
}

function getRecordField(record, snakeName, camelName) {
  if (record && Object.prototype.hasOwnProperty.call(record, snakeName)) {
    return record[snakeName];
  }

  if (record && Object.prototype.hasOwnProperty.call(record, camelName)) {
    return record[camelName];
  }

  return undefined;
}

function getSourceSite(record = {}) {
  return trimText(getRecordField(record, 'source_site', 'site'));
}

function getSourceBookId(record = {}) {
  return trimText(getRecordField(record, 'source_book_id', 'bookId'));
}

function getNormalizedNovelKey(record = {}) {
  return `${normalizeTitle(record.title)}|${normalizeAuthor(record.author)}`;
}

function findNovelForImport(record = {}) {
  const sourceSite = getSourceSite(record);
  const sourceBookId = getSourceBookId(record);

  if (sourceBookId) {
    if (!sourceSite) {
      return null;
    }

    return db.prepare(
      'SELECT * FROM novels WHERE source_site = ? AND source_book_id = ?'
    ).get(sourceSite, sourceBookId) || null;
  }

  const targetKey = getNormalizedNovelKey(record);

  if (!targetKey || targetKey === '|') {
    return null;
  }

  const novels = db.prepare('SELECT * FROM novels').all();

  for (const novel of novels) {
    if (getNormalizedNovelKey(novel) === targetKey) {
      return novel;
    }
  }

  return null;
}

function getNovelValues(record = {}) {
  const sourceSite = getSourceSite(record) || null;
  const sourceBookId = getSourceBookId(record) || null;
  const title = trimText(record.title);
  const author = trimText(record.author);
  const description = trimText(getRecordField(record, 'description', 'description'));
  const chapterCountValue = getRecordField(record, 'chapter_count', 'chapterCount');
  const chapterCount = Number(chapterCountValue) || 0;
  const freeChaptersValue = getRecordField(record, 'free_chapters', 'freeChapters');
  const freeChapters = Number(freeChaptersValue) || 0;
  const sourceCategory = trimText(getRecordField(record, 'source_category', 'sourceCategory')) || null;
  const primaryCategory = trimText(getRecordField(record, 'primary_category', 'primaryCategory')) || null;
  const coverUrl = trimText(getRecordField(record, 'cover_url', 'coverUrl')) || null;
  const contentStorage = trimText(getRecordField(record, 'content_storage', 'contentStorage')) || 'json';
  const isPremiumValue = getRecordField(record, 'is_premium', 'isPremium');
  const isPremium = Number(isPremiumValue) ? 1 : 0;

  return {
    title,
    author,
    description,
    chapterCount,
    freeChapters,
    sourceSite,
    sourceBookId,
    sourceCategory,
    primaryCategory,
    coverUrl,
    contentStorage,
    isPremium,
  };
}

function upsertNovel(record = {}) {
  const existing = findNovelForImport(record);
  const values = getNovelValues(record);

  if (existing) {
    db.prepare(`
      UPDATE novels
      SET
        title = ?,
        author = ?,
        is_premium = ?,
        chapter_count = ?,
        description = ?,
        free_chapters = ?,
        source_site = ?,
        source_book_id = ?,
        source_category = ?,
        primary_category = ?,
        cover_url = ?,
        content_storage = ?
      WHERE id = ?
    `).run(
      values.title,
      values.author,
      values.isPremium,
      values.chapterCount,
      values.description,
      values.freeChapters,
      values.sourceSite,
      values.sourceBookId,
      values.sourceCategory,
      values.primaryCategory,
      values.coverUrl,
      values.contentStorage,
      existing.id
    );

    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO novels (
      title,
      author,
      content,
      is_premium,
      chapter_count,
      description,
      free_chapters,
      source_site,
      source_book_id,
      source_category,
      primary_category,
      cover_url,
      content_storage
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    values.title,
    values.author,
    '',
    values.isPremium,
    values.chapterCount,
    values.description,
    values.freeChapters,
    values.sourceSite,
    values.sourceBookId,
    values.sourceCategory,
    values.primaryCategory,
    values.coverUrl,
    values.contentStorage
  );

  return Number(result.lastInsertRowid);
}

function normalizeChapterRecord(chapterRecord = {}) {
  const chapterNumberValue = getRecordField(chapterRecord, 'chapter_number', 'chapterNumber');
  const chapterNumber = Number(chapterNumberValue);
  const title = trimText(chapterRecord.title);
  const sourceChapterId = trimText(getRecordField(chapterRecord, 'source_chapter_id', 'sourceChapterId')) || null;
  const contentFilePath = trimText(getRecordField(chapterRecord, 'content_file_path', 'contentFilePath')) || null;
  const contentPreview = trimText(getRecordField(chapterRecord, 'content_preview', 'contentPreview'));

  return {
    chapterNumber,
    title,
    sourceChapterId,
    contentFilePath,
    contentPreview,
  };
}

function replaceChapters(novelId, chapterRecords = []) {
  const normalizedRecords = chapterRecords
    .map((chapterRecord) => normalizeChapterRecord(chapterRecord))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  db.prepare('DELETE FROM chapters WHERE novel_id = ?').run(novelId);

  const insertChapter = db.prepare(`
    INSERT INTO chapters (
      novel_id,
      chapter_number,
      title,
      content,
      is_premium,
      word_count,
      source_chapter_id,
      content_file_path,
      content_preview
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const chapter of normalizedRecords) {
    insertChapter.run(
      novelId,
      chapter.chapterNumber,
      chapter.title,
      '',
      0,
      0,
      chapter.sourceChapterId,
      chapter.contentFilePath,
      chapter.contentPreview
    );
  }

  db.prepare('UPDATE novels SET chapter_count = ? WHERE id = ?').run(normalizedRecords.length, novelId);

  return normalizedRecords.length;
}

module.exports = {
  findNovelForImport,
  upsertNovel,
  replaceChapters,
};

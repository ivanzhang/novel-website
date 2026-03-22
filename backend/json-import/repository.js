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

function hasExplicitRecordField(record, snakeName, camelName) {
  return record
    && (
      Object.prototype.hasOwnProperty.call(record, snakeName)
      || Object.prototype.hasOwnProperty.call(record, camelName)
    );
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
  const matches = [];

  for (const novel of novels) {
    if (getNormalizedNovelKey(novel) === targetKey) {
      matches.push(novel);
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length > 1) {
    throw new Error('title + author 回退命中多条已有小说，拒绝更新');
  }

  return matches[0];
}

function getNovelValues(record = {}) {
  const hasSourceSite = hasExplicitRecordField(record, 'source_site', 'site');
  const hasSourceBookId = hasExplicitRecordField(record, 'source_book_id', 'bookId');
  const sourceSite = hasSourceSite ? (getSourceSite(record) || null) : undefined;
  const sourceBookId = hasSourceBookId ? (getSourceBookId(record) || null) : undefined;
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
    values.sourceSite ?? existing.source_site,
    values.sourceBookId ?? existing.source_book_id,
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
  const content = getRecordField(chapterRecord, 'content', 'content');
  const wordCountValue = getRecordField(chapterRecord, 'word_count', 'wordCount');
  const isPremiumValue = getRecordField(chapterRecord, 'is_premium', 'isPremium');

  return {
    chapterNumber,
    title,
    sourceChapterId,
    contentFilePath,
    contentPreview,
    content,
    hasContent: hasExplicitRecordField(chapterRecord, 'content', 'content'),
    wordCount: Number(wordCountValue),
    hasWordCount: hasExplicitRecordField(chapterRecord, 'word_count', 'wordCount'),
    isPremium: Number(isPremiumValue),
    hasIsPremium: hasExplicitRecordField(chapterRecord, 'is_premium', 'isPremium'),
  };
}

function ensurePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} 必须是正整数`);
  }
}

function replaceChapters(novelId, chapterRecords = []) {
  const normalizedRecords = chapterRecords
    .map((chapterRecord) => normalizeChapterRecord(chapterRecord))
    .sort((a, b) => a.chapterNumber - b.chapterNumber);

  const seenChapterNumbers = new Set();

  for (const chapter of normalizedRecords) {
    ensurePositiveInteger(chapter.chapterNumber, 'chapter_number');

    if (seenChapterNumbers.has(chapter.chapterNumber)) {
      throw new Error('chapter_number 不能重复');
    }

    seenChapterNumbers.add(chapter.chapterNumber);
  }

  const existingChapters = db.prepare(
    'SELECT id, chapter_number, content, is_premium, word_count FROM chapters WHERE novel_id = ?'
  ).all(novelId);
  const existingChapterMap = new Map(existingChapters.map((chapter) => [chapter.chapter_number, chapter]));

  const updateChapter = db.prepare(`
    UPDATE chapters
    SET
      title = ?,
      content = ?,
      is_premium = ?,
      word_count = ?,
      source_chapter_id = ?,
      content_file_path = ?,
      content_preview = ?
    WHERE id = ?
  `);

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
    const existingChapter = existingChapterMap.get(chapter.chapterNumber);

    if (existingChapter) {
      updateChapter.run(
        chapter.title,
        chapter.hasContent ? chapter.content : existingChapter.content,
        chapter.hasIsPremium ? chapter.isPremium : existingChapter.is_premium,
        chapter.hasWordCount ? chapter.wordCount : existingChapter.word_count,
        chapter.sourceChapterId,
        chapter.contentFilePath,
        chapter.contentPreview,
        existingChapter.id
      );
    } else {
      insertChapter.run(
        novelId,
        chapter.chapterNumber,
        chapter.title,
        chapter.hasContent ? chapter.content : '',
        chapter.hasIsPremium ? chapter.isPremium : 0,
        chapter.hasWordCount ? chapter.wordCount : 0,
        chapter.sourceChapterId,
        chapter.contentFilePath,
        chapter.contentPreview
      );
    }
  }

  const incomingChapterNumbers = [...seenChapterNumbers];

  if (incomingChapterNumbers.length === 0) {
    db.prepare('DELETE FROM chapters WHERE novel_id = ?').run(novelId);
  } else {
    const placeholders = incomingChapterNumbers.map(() => '?').join(', ');
    db.prepare(`DELETE FROM chapters WHERE novel_id = ? AND chapter_number NOT IN (${placeholders})`)
      .run(novelId, ...incomingChapterNumbers);
  }

  db.prepare('UPDATE novels SET chapter_count = ? WHERE id = ?').run(normalizedRecords.length, novelId);

  return normalizedRecords.length;
}

const importNovelRecord = db.transaction((record, chapterRecords = []) => {
  const novelId = upsertNovel(record);
  replaceChapters(novelId, chapterRecords);
  return novelId;
});

module.exports = {
  findNovelForImport,
  upsertNovel,
  replaceChapters,
  importNovelRecord,
};

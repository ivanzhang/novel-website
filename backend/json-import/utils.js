const path = require('node:path');

const {
  normalizeTitle,
  normalizeAuthor,
} = require('../admin/import-utils');

const SOURCE_CATEGORY_MAP = new Map([
  ['玄幻奇幻', '玄幻'],
  ['武侠仙侠', '仙侠'],
  ['都市言情', '都市'],
]);

function toText(value) {
  return value == null ? '' : String(value);
}

function mapPrimaryCategory(sourceCategory) {
  const normalizedSourceCategory = toText(sourceCategory).normalize('NFKC').replace(/\s+/g, '');
  return SOURCE_CATEGORY_MAP.get(normalizedSourceCategory) || normalizedSourceCategory;
}

function buildNovelLookupKey(book = {}) {
  if (book.bookId != null && toText(book.bookId).trim() !== '') {
    return `bookId:${toText(book.bookId).trim()}`;
  }

  return `titleAuthor:${normalizeTitle(book.title)}|${normalizeAuthor(book.author)}`;
}

function buildChapterFilePath(bookId, chapterNumber) {
  return path.posix.join('chapters', toText(bookId), `${toText(chapterNumber)}.json`);
}

function buildContentPreview(content) {
  const preview = toText(content)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();

  return preview.slice(0, 120);
}

function normalizeBookRecord(bookJson = {}, rootDir = '') {
  void rootDir;
  const chapters = Array.isArray(bookJson.chapters)
    ? bookJson.chapters.map((chapter) => ({ ...chapter }))
    : [];

  return {
    site: toText(bookJson.site),
    bookId: toText(bookJson.bookId),
    title: toText(bookJson.title),
    author: toText(bookJson.author),
    category: toText(bookJson.category),
    primaryCategory: mapPrimaryCategory(bookJson.category),
    status: toText(bookJson.status),
    intro: toText(bookJson.intro),
    lastUpdate: toText(bookJson.lastUpdate),
    lastChapter: toText(bookJson.lastChapter),
    cover: toText(bookJson.cover),
    chapterCount: Number(bookJson.chapterCount) || 0,
    chapters,
    fetchedAt: toText(bookJson.fetchedAt),
    lookupKey: buildNovelLookupKey(bookJson),
  };
}

function normalizeChapterRecord(bookJson = {}, chapterJson = {}, rootDir = '') {
  void rootDir;
  const bookId = toText(chapterJson.bookId || bookJson.bookId);
  const chapterNumber = Number(chapterJson.chapterNumber) || 0;

  return {
    site: toText(chapterJson.site || bookJson.site),
    apiHost: toText(chapterJson.apiHost),
    bookId,
    bookTitle: toText(chapterJson.bookTitle || bookJson.title),
    author: toText(chapterJson.author || bookJson.author),
    chapterNumber,
    title: toText(chapterJson.title),
    sourceUrl: toText(chapterJson.sourceUrl),
    pageUrls: Array.isArray(chapterJson.pageUrls) ? [...chapterJson.pageUrls] : [],
    content: toText(chapterJson.content),
    contentPreview: buildContentPreview(chapterJson.content),
    contentFilePath: buildChapterFilePath(bookId, chapterNumber),
    fetchedAt: toText(chapterJson.fetchedAt),
  };
}

module.exports = {
  mapPrimaryCategory,
  buildNovelLookupKey,
  buildChapterFilePath,
  buildContentPreview,
  normalizeBookRecord,
  normalizeChapterRecord,
};

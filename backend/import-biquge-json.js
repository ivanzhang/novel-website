#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const {
  buildChapterFilePath,
  buildContentPreview,
  mapPrimaryCategory,
} = require('./json-import/utils');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ROOT = path.join(PROJECT_ROOT, 'storage/json/biquge');

if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.join(__dirname, 'novels.db');
}

let dbInstance;
let repository;

function getDb() {
  if (!dbInstance) {
    dbInstance = require('./db');
  }

  return dbInstance;
}

function getRepository() {
  if (!repository) {
    repository = require('./json-import/repository');
  }

  return repository;
}

function resolveRoot(rootPath = DEFAULT_ROOT) {
  return path.resolve(PROJECT_ROOT, rootPath);
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const options = {
    root: DEFAULT_ROOT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    switch (current) {
      case '--root':
        options.root = resolveRoot(args[index + 1] || DEFAULT_ROOT);
        index += 1;
        break;
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
笔趣阁 JSON 批量导入工具

用法:
  node backend/import-biquge-json.js [--root ./storage/json/biquge]

选项:
  --root   扫描源目录，默认 ./storage/json/biquge
  --help   显示帮助
`);
}

async function readJsonFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function buildLocalCoverUrl(bookJson = {}) {
  const bookId = String(bookJson.bookId || '').trim();

  if (!bookId) {
    return null;
  }

  return `/covers/${bookId}.jpg`;
}

function buildNovelRecord(bookJson = {}) {
  const bookId = String(bookJson.bookId || '');

  return {
    site: bookJson.site || '',
    source_site: bookJson.site || '',
    bookId,
    source_book_id: bookId,
    title: bookJson.title || '',
    author: bookJson.author || '',
    description: bookJson.intro || '',
    chapter_count: Number(bookJson.chapterCount) || 0,
    source_category: bookJson.category || '',
    primary_category: mapPrimaryCategory(bookJson.category || ''),
    cover_url: buildLocalCoverUrl(bookJson),
    content_storage: 'json',
  };
}

function buildChapterRecord(bookJson = {}, chapterJson = {}) {
  const bookId = String(bookJson.bookId || chapterJson.bookId || '');
  const chapterNumber = Number(chapterJson.chapterNumber || 0);
  const contentFilePath = buildChapterFilePath(bookId, chapterNumber);

  return {
    site: chapterJson.site || bookJson.site || '',
    apiHost: chapterJson.apiHost || '',
    bookId,
    bookTitle: chapterJson.bookTitle || bookJson.title || '',
    author: chapterJson.author || bookJson.author || '',
    chapterNumber,
    title: chapterJson.title || '',
    sourceUrl: chapterJson.sourceUrl || '',
    pageUrls: Array.isArray(chapterJson.pageUrls) ? [...chapterJson.pageUrls] : [],
    content: '',
    content_preview: buildContentPreview(chapterJson.content || ''),
    content_file_path: contentFilePath,
  };
}

function toExpectedChapterNumbers(bookJson = {}) {
  if (!Array.isArray(bookJson.chapters)) {
    return new Set();
  }

  return new Set(
    bookJson.chapters
      .map((chapter) => Number(chapter && chapter.chapterNumber))
      .filter((chapterNumber) => Number.isInteger(chapterNumber) && chapterNumber > 0)
  );
}

async function listChapterFileNames(chaptersDir) {
  try {
    const entries = await fs.readdir(chaptersDir, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function importOneBook(root, bookFileName) {
  const { findNovelForImport, importNovelRecord } = getRepository();
  const bookFilePath = path.join(root, 'books', bookFileName);
  const bookJson = await readJsonFile(bookFilePath);
  const novelRecord = buildNovelRecord(bookJson);
  const existingNovel = findNovelForImport(novelRecord);
  const chaptersDir = path.join(root, 'chapters', String(bookJson.bookId || ''));
  const chapterFileNames = await listChapterFileNames(chaptersDir);
  const expectedChapterNumbers = toExpectedChapterNumbers(bookJson);
  const chapterRecords = [];
  const importedChapterNumbers = new Set();

  for (const chapterFileName of chapterFileNames) {
    const chapterFilePath = path.join(chaptersDir, chapterFileName);
    const chapterNumber = Number.parseInt(path.basename(chapterFileName, '.json'), 10);

    if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) {
      continue;
    }

    const chapterJson = await readJsonFile(chapterFilePath);
    chapterRecords.push(buildChapterRecord(bookJson, chapterJson));
    importedChapterNumbers.add(chapterNumber);
  }

  const missingContentFiles = [...expectedChapterNumbers]
    .filter((chapterNumber) => !importedChapterNumbers.has(chapterNumber))
    .length;

  const novelId = importNovelRecord(novelRecord, chapterRecords);
  const sourceChapterCount = Number(bookJson.chapterCount);

  if (Number.isFinite(sourceChapterCount) && sourceChapterCount >= 0) {
    getDb().prepare('UPDATE novels SET chapter_count = ? WHERE id = ?')
      .run(sourceChapterCount, novelId);
  }

  return {
    status: existingNovel ? 'updated' : 'added',
    missingContentFiles,
    novelId,
  };
}

async function importBiqugeJson(options = {}) {
  const root = resolveRoot(options.root || DEFAULT_ROOT);
  const booksDir = path.join(root, 'books');
  const entries = await fs.readdir(booksDir, { withFileTypes: true });
  const bookFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));

  const stats = {
    total: bookFiles.length,
    added: 0,
    updated: 0,
    failed: 0,
    missingContentFiles: 0,
  };

  for (const bookFileName of bookFiles) {
    try {
      const result = await importOneBook(root, bookFileName);
      stats[result.status] += 1;
      stats.missingContentFiles += result.missingContentFiles;
    } catch (error) {
      stats.failed += 1;
      console.error(`导入失败: ${bookFileName} - ${error.message}`);
    }
  }

  return stats;
}

function printStats(stats) {
  console.log('导入完成');
  console.log(`总数: ${stats.total}`);
  console.log(`新增: ${stats.added}`);
  console.log(`更新: ${stats.updated}`);
  console.log(`失败: ${stats.failed}`);
  console.log(`缺失正文文件数: ${stats.missingContentFiles}`);
}

async function main() {
  const options = parseArgs(process.argv);

  try {
    const stats = await importBiqugeJson(options);
    printStats(stats);
  } finally {
    const activeDb = dbInstance;

    if (activeDb && typeof activeDb.close === 'function') {
      activeDb.close();
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  resolveRoot,
  parseArgs,
  printHelp,
  buildLocalCoverUrl,
  buildNovelRecord,
  buildChapterRecord,
  importOneBook,
  importBiqugeJson,
  printStats,
};

#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ROOT = path.join(PROJECT_ROOT, 'storage/json/biquge');
const DEFAULT_LIMIT = 20;

if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.join(__dirname, 'novels.db');
}

let dbInstance;

function getDb() {
  if (!dbInstance) {
    dbInstance = require('./db');
  }

  return dbInstance;
}

function resolveRoot(rootPath = DEFAULT_ROOT) {
  return path.resolve(PROJECT_ROOT, rootPath);
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const options = {
    root: DEFAULT_ROOT,
    limit: DEFAULT_LIMIT,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    switch (current) {
      case '--root':
        options.root = resolveRoot(args[index + 1] || DEFAULT_ROOT);
        index += 1;
        break;
      case '--limit':
        options.limit = Math.max(1, Number(args[index + 1]) || DEFAULT_LIMIT);
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
笔趣阁 JSON 导入对账工具

用法:
  node backend/biquge-import-reconcile.js [--root ./storage/json/biquge] [--limit 20]

选项:
  --root   扫描源目录，默认 ./storage/json/biquge
  --limit  终端最多打印多少条未入库结果，默认 20
  --help   显示帮助
`);
}

async function readJsonFile(filePath) {
  const text = await fs.readFile(filePath, 'utf8');
  return JSON.parse(text);
}

function normalizeBookEntry(bookJson, fileName) {
  const bookId = bookJson.bookId == null ? '' : String(bookJson.bookId).trim();

  if (!bookId) {
    return {
      valid: false,
      fileName,
      reason: 'bookId 缺失或为空',
    };
  }

  return {
    valid: true,
    bookId,
    title: bookJson.title || '',
    author: bookJson.author || '',
    fileName,
    sourceCategory: bookJson.category || '',
  };
}

async function loadBookInventory(root) {
  const booksDir = path.join(root, 'books');
  const entries = await fs.readdir(booksDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));

  const validBooks = [];
  const invalidBooks = [];

  for (const fileName of files) {
    const bookJson = await readJsonFile(path.join(booksDir, fileName));
    const normalized = normalizeBookEntry(bookJson, fileName);

    if (normalized.valid) {
      validBooks.push(normalized);
    } else {
      invalidBooks.push({
        fileName: normalized.fileName,
        reason: normalized.reason,
      });
    }
  }

  return {
    totalBookFiles: files.length,
    validBooks,
    invalidBooks,
  };
}

function loadImportedBookIds() {
  const rows = getDb().prepare(`
    SELECT source_book_id
    FROM novels
    WHERE source_book_id IS NOT NULL AND TRIM(source_book_id) != ''
  `).all();

  return new Set(rows.map((row) => String(row.source_book_id).trim()));
}

async function reconcileBiqugeImport(options = {}) {
  const root = resolveRoot(options.root || DEFAULT_ROOT);
  const inventory = await loadBookInventory(root);
  const importedBookIds = loadImportedBookIds();
  const validBookIdSet = new Set(inventory.validBooks.map((book) => book.bookId));

  const missingBooks = inventory.validBooks
    .filter((book) => !importedBookIds.has(book.bookId))
    .map((book) => ({
      bookId: book.bookId,
      title: book.title,
      author: book.author,
      fileName: book.fileName,
      sourceCategory: book.sourceCategory,
    }));

  const databaseOnlyBooks = [...importedBookIds]
    .filter((bookId) => !validBookIdSet.has(bookId))
    .sort((a, b) => a.localeCompare(b, 'en'));

  return {
    summary: {
      totalBookFiles: inventory.totalBookFiles,
      validBookFiles: inventory.validBooks.length,
      invalidBookFiles: inventory.invalidBooks.length,
      importedBooks: inventory.validBooks.length - missingBooks.length,
      missingBooks: missingBooks.length,
      databaseOnlyBooks: databaseOnlyBooks.length,
    },
    missingBooks,
    invalidBooks: inventory.invalidBooks,
    databaseOnlyBooks,
  };
}

function printList(title, items, formatter, limit) {
  if (items.length === 0) {
    return;
  }

  console.log(`${title}: ${items.length}`);
  for (const item of items.slice(0, limit)) {
    console.log(`- ${formatter(item)}`);
  }

  if (items.length > limit) {
    console.log(`- ... 还有 ${items.length - limit} 条未展示`);
  }
}

function printReport(result, limit = DEFAULT_LIMIT) {
  console.log('导入对账完成');
  console.log(`书文件总数: ${result.summary.totalBookFiles}`);
  console.log(`有效书文件: ${result.summary.validBookFiles}`);
  console.log(`异常书文件: ${result.summary.invalidBookFiles}`);
  console.log(`已入库书数: ${result.summary.importedBooks}`);
  console.log(`未入库书数: ${result.summary.missingBooks}`);
  console.log(`数据库多出书数: ${result.summary.databaseOnlyBooks}`);

  printList(
    '未入库书单',
    result.missingBooks,
    (book) => `${book.bookId} | ${book.title} | ${book.author} | ${book.fileName} | ${book.sourceCategory || '未分类'}`,
    limit
  );
  printList(
    '异常书文件',
    result.invalidBooks,
    (book) => `${book.fileName} | ${book.reason}`,
    limit
  );
  printList(
    '数据库独有 source_book_id',
    result.databaseOnlyBooks,
    (bookId) => bookId,
    limit
  );
}

async function main() {
  const options = parseArgs(process.argv);

  try {
    const result = await reconcileBiqugeImport(options);
    printReport(result, options.limit);
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
  normalizeBookEntry,
  loadBookInventory,
  reconcileBiqugeImport,
  printReport,
};

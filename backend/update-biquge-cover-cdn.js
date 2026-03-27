#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

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

function resolveProjectPath(targetPath) {
  return path.resolve(PROJECT_ROOT, targetPath);
}

function applyCoverCdn(book, cdnUrl) {
  return {
    ...book,
    cover: {
      ...(book.cover || {}),
      cdnUrl,
    },
  };
}

function buildBookCoverMap(fileMap) {
  const result = {};

  for (const [fileName, cdnUrl] of Object.entries(fileMap || {})) {
    const bookId = path.parse(fileName).name;
    if (!bookId || !cdnUrl) {
      continue;
    }

    result[String(bookId)] = cdnUrl;
  }

  return result;
}

function pickBookFilesToUpdate(bookFiles, coverMap, limit = Infinity) {
  return bookFiles
    .filter((fileName) => {
      const bookId = path.parse(fileName).name;
      return Boolean(coverMap[bookId]);
    })
    .slice(0, Number.isFinite(limit) ? limit : undefined);
}

function parseArgs(argv) {
  const options = {
    root: 'storage/json/biquge',
    mapFile: 'storage/json/biquge/cover-cdn-map.json',
    limit: Infinity,
    syncDb: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--root') {
      options.root = argv[index + 1];
      index += 1;
    } else if (arg === '--map-file') {
      options.mapFile = argv[index + 1];
      index += 1;
    } else if (arg === '--limit') {
      options.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--sync-db') {
      options.syncDb = true;
    }
  }

  return options;
}

function updateNovelCoverUrlsWithMap(coverMap = {}) {
  const db = getDb();
  const novels = db.prepare('SELECT id, source_book_id, cover_url FROM novels').all();
  const update = db.prepare('UPDATE novels SET cover_url = ? WHERE id = ?');
  const stats = {
    updated: 0,
    skippedMissingCoverMap: 0,
    skippedWithoutSourceBookId: 0,
    skippedAlreadyUpToDate: 0,
  };

  for (const novel of novels) {
    const sourceBookId = novel.source_book_id == null ? '' : String(novel.source_book_id).trim();

    if (!sourceBookId) {
      stats.skippedWithoutSourceBookId += 1;
      continue;
    }

    const cdnUrl = coverMap[sourceBookId];
    if (!cdnUrl) {
      stats.skippedMissingCoverMap += 1;
      continue;
    }

    if (String(novel.cover_url || '').trim() === cdnUrl) {
      stats.skippedAlreadyUpToDate += 1;
      continue;
    }

    // 统一把 DB 中的封面地址切到 CDN，避免线上运行依赖本地 covers 文件。
    update.run(cdnUrl, novel.id);
    stats.updated += 1;
  }

  return stats;
}

function checkpointDatabaseForExternalReaders() {
  const db = getDb();

  // 生产环境里容器通过单文件挂载读取 DB，先 checkpoint 才能立刻看到主机侧写入结果。
  db.pragma('wal_checkpoint(TRUNCATE)');
}

async function updateBooksWithCoverCdn(options = {}) {
  const root = resolveProjectPath(options.root || 'storage/json/biquge');
  const mapFile = resolveProjectPath(options.mapFile || 'storage/json/biquge/cover-cdn-map.json');
  const booksDir = path.join(root, 'books');
  const rawMap = JSON.parse(await fsp.readFile(mapFile, 'utf8'));
  const coverMap = buildBookCoverMap(rawMap);
  const allBookFiles = (await fsp.readdir(booksDir))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));
  const bookFiles = pickBookFilesToUpdate(allBookFiles, coverMap, options.limit);

  const stats = {
    updated: 0,
    skippedMissingCoverMap: 0,
  };

  for (const fileName of bookFiles) {
    const bookId = path.parse(fileName).name;
    const cdnUrl = coverMap[bookId];

    if (!cdnUrl) {
      stats.skippedMissingCoverMap += 1;
      continue;
    }

    const filePath = path.join(booksDir, fileName);
    const book = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    const updated = applyCoverCdn(book, cdnUrl);
    await fsp.writeFile(filePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
    stats.updated += 1;
  }

  return stats;
}

async function main() {
  const options = parseArgs(process.argv);
  const stats = await updateBooksWithCoverCdn(options);
  const mapFile = resolveProjectPath(options.mapFile || path.join(options.root || 'storage/json/biquge', 'cover-cdn-map.json'));
  let dbStats = null;

  if (options.syncDb) {
    const rawMap = JSON.parse(await fsp.readFile(mapFile, 'utf8'));
    const coverMap = buildBookCoverMap(rawMap);
    dbStats = updateNovelCoverUrlsWithMap(coverMap);
    checkpointDatabaseForExternalReaders();
  }

  console.log('封面 CDN 回写完成');
  console.log(`更新数量: ${stats.updated}`);
  console.log(`缺少映射: ${stats.skippedMissingCoverMap}`);
  if (options.syncDb && dbStats) {
    console.log('数据库封面地址同步完成');
    console.log(`DB 更新数量: ${dbStats.updated}`);
    console.log(`DB 缺少映射: ${dbStats.skippedMissingCoverMap}`);
    console.log(`DB 缺少 source_book_id: ${dbStats.skippedWithoutSourceBookId}`);
    console.log(`DB 已是最新: ${dbStats.skippedAlreadyUpToDate}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }).finally(() => {
    const activeDb = dbInstance;

    if (activeDb && typeof activeDb.close === 'function') {
      activeDb.close();
    }
  });
}

module.exports = {
  applyCoverCdn,
  buildBookCoverMap,
  pickBookFilesToUpdate,
  parseArgs,
  updateBooksWithCoverCdn,
  updateNovelCoverUrlsWithMap,
  checkpointDatabaseForExternalReaders,
};

/*
用法示例：

node backend/update-biquge-cover-cdn.js \
  --root storage/json/biquge \
  --map-file storage/json/biquge/cover-cdn-map.json

node backend/update-biquge-cover-cdn.js \
  --root storage/json/biquge \
  --map-file storage/json/biquge/cover-cdn-map.json \
  --sync-db
*/

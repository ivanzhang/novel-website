#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ROOT = path.join(PROJECT_ROOT, 'storage/json/biquge');

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

function buildLocalCoverUrl(sourceBookId) {
  return `/covers/${String(sourceBookId).trim()}.jpg`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function updateBiqugeCoverPaths(options = {}) {
  const root = resolveRoot(options.root || DEFAULT_ROOT);
  const coversDir = path.join(root, 'covers');
  const db = getDb();
  const novels = db.prepare('SELECT id, source_book_id FROM novels').all();
  const update = db.prepare('UPDATE novels SET cover_url = ? WHERE id = ?');

  const stats = {
    updated: 0,
    skippedMissingFiles: 0,
    skippedWithoutSourceBookId: 0,
  };

  for (const novel of novels) {
    const sourceBookId = novel.source_book_id == null ? '' : String(novel.source_book_id).trim();

    if (!sourceBookId) {
      stats.skippedWithoutSourceBookId += 1;
      continue;
    }

    const coverFilePath = path.join(coversDir, `${sourceBookId}.jpg`);
    if (!await fileExists(coverFilePath)) {
      stats.skippedMissingFiles += 1;
      continue;
    }

    update.run(buildLocalCoverUrl(sourceBookId), novel.id);
    stats.updated += 1;
  }

  return stats;
}

async function main() {
  try {
    const stats = await updateBiqugeCoverPaths();
    console.log('封面路径修正完成');
    console.log(`更新数量: ${stats.updated}`);
    console.log(`缺少本地封面: ${stats.skippedMissingFiles}`);
    console.log(`缺少 source_book_id: ${stats.skippedWithoutSourceBookId}`);
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
  buildLocalCoverUrl,
  updateBiqugeCoverPaths,
};

#!/usr/bin/env node

const fsp = require('node:fs/promises');
const path = require('node:path');
const { buildDefaultTaskReportPath, writeTaskReport } = require('./task-report');

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

function chunkFiles(files, size = 10) {
  const result = [];

  for (let index = 0; index < files.length; index += size) {
    result.push(files.slice(index, index + size));
  }

  return result;
}

function buildChapterMapKey(entry = {}) {
  const bookId = String(entry.bookId || '').trim();
  const chapterNumber = Number.parseInt(entry.chapterNumber, 10);

  if (!bookId || !Number.isInteger(chapterNumber) || chapterNumber <= 0) {
    return '';
  }

  return `${bookId}/${chapterNumber}.json`;
}

function parseChapterMapKey(key) {
  const normalized = String(key || '').trim();
  const match = normalized.match(/^(\d+)\/(\d+)\.json$/);

  if (!match) {
    return null;
  }

  return {
    bookId: match[1],
    chapterNumber: Number.parseInt(match[2], 10),
  };
}

function compareBookId(left, right) {
  const leftNumber = Number.parseInt(left, 10);
  const rightNumber = Number.parseInt(right, 10);

  if (Number.isInteger(leftNumber) && Number.isInteger(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right, 'en');
}

async function scanChapterFiles(chaptersRoot, options = {}) {
  const bookEntries = await fsp.readdir(chaptersRoot, { withFileTypes: true });
  const bookDirs = bookEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((bookId) => {
      if (options.startBook && compareBookId(bookId, String(options.startBook)) < 0) {
        return false;
      }

      if (options.endBook && compareBookId(bookId, String(options.endBook)) > 0) {
        return false;
      }

      return true;
    })
    .sort(compareBookId);

  const files = [];

  for (const bookId of bookDirs) {
    const chapterDir = path.join(chaptersRoot, bookId);
    const entries = await fsp.readdir(chapterDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }

      const chapterNumber = Number.parseInt(path.basename(entry.name, '.json'), 10);
      if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) {
        continue;
      }

      const item = {
        bookId,
        chapterNumber,
        key: `${bookId}/${chapterNumber}.json`,
        name: `${bookId}-${chapterNumber}.json`,
        path: path.join(chapterDir, entry.name),
      };

      files.push(item);
    }
  }

  return files.sort((left, right) => {
    const bookCompare = compareBookId(left.bookId, right.bookId);
    if (bookCompare !== 0) {
      return bookCompare;
    }

    return left.chapterNumber - right.chapterNumber;
  });
}

function pickPendingEntries(entries, existingMap = {}) {
  return entries.filter((entry) => !existingMap[entry.key]);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function saveMap(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function parseArgs(argv = process.argv) {
  const options = {
    root: 'storage/json/biquge',
    endpoint: '',
    mapFile: '',
    report: '',
    limit: Infinity,
    batchSize: 10,
    batchRateMs: 2000,
    requestTimeoutMs: 20000,
    startBook: null,
    endBook: null,
    deleteLocal: true,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--root') {
      options.root = argv[index + 1];
      index += 1;
    } else if (arg === '--endpoint') {
      options.endpoint = argv[index + 1];
      index += 1;
    } else if (arg === '--map-file') {
      options.mapFile = argv[index + 1];
      index += 1;
    } else if (arg === '--report') {
      options.report = argv[index + 1];
      index += 1;
    } else if (arg === '--limit') {
      options.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--batch-size') {
      options.batchSize = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--batch-rate-ms') {
      options.batchRateMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--request-timeout-ms') {
      options.requestTimeoutMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--start-book') {
      options.startBook = argv[index + 1];
      index += 1;
    } else if (arg === '--end-book') {
      options.endBook = argv[index + 1];
      index += 1;
    } else if (arg === '--keep-local') {
      options.deleteLocal = false;
    } else if (arg === '--delete-local') {
      options.deleteLocal = true;
    }
  }

  return options;
}

function buildRetryDelayMs(error) {
  const message = error && error.message ? String(error.message) : '';
  const match = message.match(/retry after\s+(\d+)/i);

  if (!match) {
    return 0;
  }

  return Number.parseInt(match[1], 10) * 1000;
}

function absolutizeSrc(src, endpoint) {
  if (!src) {
    return src;
  }

  if (/^https?:\/\//.test(src)) {
    return src;
  }

  const baseUrl = new URL(endpoint);
  return new URL(src, `${baseUrl.origin}/`).toString();
}

async function uploadGroup(entries, endpoint, options = {}) {
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch;
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs)
    ? Math.max(1, Number(options.requestTimeoutMs))
    : 20000;
  const formData = new FormData();

  for (const entry of entries) {
    const buffer = await fsp.readFile(entry.path);
    const blob = new Blob([buffer], { type: 'application/json' });
    formData.append('file', blob, entry.name);
  }

  // 这里同时使用 signal + Promise.race，确保自定义 fetch 也能被超时兜住。
  const controller = new AbortController();
  let timeoutReject;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutReject = reject;
  });
  const timeoutId = setTimeout(() => {
    controller.abort();
    timeoutReject(new Error(`Upload request timeout after ${requestTimeoutMs}ms`));
  }, requestTimeoutMs);

  let response;
  try {
    response = await Promise.race([
      fetchImpl(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      }),
      timeoutPromise,
    ]);
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new Error(`Upload request timeout after ${requestTimeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json();

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : `Upload failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!Array.isArray(payload)) {
    throw new Error('Upload response is not an array');
  }

  return payload.map((item) => ({
    ...item,
    src: absolutizeSrc(item.src, endpoint),
  }));
}

function normalizeChapterUploadResults(entries, results) {
  const map = {};

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const result = results[index] || {};
    const src = String(result.src || '').trim();

    if (!src) {
      continue;
    }

    map[entry.key] = src;
  }

  return map;
}

function syncChapterCdnUrlsToDb(chapterMap = {}) {
  const db = getDb();
  const findChapter = db.prepare(`
    SELECT c.id, c.content_cdn_url
    FROM chapters c
    INNER JOIN novels n ON n.id = c.novel_id
    WHERE n.source_book_id = ? AND c.chapter_number = ?
    ORDER BY c.id ASC
    LIMIT 1
  `);
  const updateChapter = db.prepare('UPDATE chapters SET content_cdn_url = ? WHERE id = ?');

  const stats = {
    updated: 0,
    skippedInvalidKey: 0,
    skippedMissingRows: 0,
    skippedAlreadyUpToDate: 0,
    updatedKeys: [],
  };

  for (const [key, cdnUrl] of Object.entries(chapterMap || {})) {
    const parsed = parseChapterMapKey(key);

    if (!parsed || !cdnUrl) {
      stats.skippedInvalidKey += 1;
      continue;
    }

    const chapterRow = findChapter.get(parsed.bookId, parsed.chapterNumber);
    if (!chapterRow) {
      stats.skippedMissingRows += 1;
      continue;
    }

    if (String(chapterRow.content_cdn_url || '').trim() === cdnUrl) {
      stats.skippedAlreadyUpToDate += 1;
      stats.updatedKeys.push(key);
      continue;
    }

    updateChapter.run(cdnUrl, chapterRow.id);
    stats.updated += 1;
    stats.updatedKeys.push(key);
  }

  return stats;
}

function checkpointDatabaseForExternalReaders() {
  const db = getDb();

  // 生产环境里容器通过单文件挂载读取 DB，先 checkpoint 才能立刻看到主机侧写入结果。
  db.pragma('wal_checkpoint(TRUNCATE)');
}

async function removeUploadedLocalFiles(chaptersRoot, entries = []) {
  let removed = 0;

  for (const entry of entries) {
    const filePath = path.join(chaptersRoot, String(entry.bookId), `${Number(entry.chapterNumber)}.json`);

    try {
      await fsp.rm(filePath, { force: true });
      removed += 1;
    } catch {
      // 删除失败交由上层统计告警，不在这里中断全批次。
    }
  }

  return removed;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadBiqugeChapterCdn(options = {}) {
  const root = resolveProjectPath(options.root || 'storage/json/biquge');
  const chaptersRoot = path.join(root, 'chapters');
  const mapFile = resolveProjectPath(options.mapFile || path.join(options.root || 'storage/json/biquge', 'chapter-cdn-map.json'));
  const reportPath = resolveProjectPath(options.report || buildDefaultTaskReportPath(root, 'upload-biquge-chapter-cdn'));
  const allEntries = await scanChapterFiles(chaptersRoot, {
    startBook: options.startBook,
    endBook: options.endBook,
  });
  const existingMap = await readJsonIfExists(mapFile);
  const pendingEntries = pickPendingEntries(allEntries, existingMap)
    .slice(0, Number.isFinite(options.limit) ? options.limit : undefined);
  const groups = chunkFiles(pendingEntries, options.batchSize || 10);

  const state = {
    root,
    chaptersRoot,
    mapFile,
    reportPath,
    groups,
    existingMap,
    pendingEntries,
  };

  if (!options.endpoint) {
    await writeTaskReport(reportPath, {
      task: 'upload-biquge-chapter-cdn',
      status: 'planned',
      summary: {
        pendingFiles: pendingEntries.length,
        pendingGroups: groups.length,
      },
      items: pendingEntries.slice(0, 200).map((entry) => ({ key: entry.key, status: 'pending' })),
    });

    return {
      ...state,
      stats: {
        uploaded: 0,
        dbUpdated: 0,
        deletedLocal: 0,
        failedGroups: 0,
        retriedGroups: 0,
      },
    };
  }

  const mergedMap = { ...existingMap };
  const stats = {
    uploaded: 0,
    dbUpdated: 0,
    dbMissingRows: 0,
    deletedLocal: 0,
    failedGroups: 0,
    retriedGroups: 0,
  };
  const items = [];
  const baseThrottleMs = Math.max(0, Number.isFinite(options.batchRateMs) ? options.batchRateMs : 0);
  let dynamicThrottleMs = baseThrottleMs;

  for (const group of groups) {
    await sleep(dynamicThrottleMs);

    try {
      let uploadResults;

      try {
        uploadResults = await uploadGroup(group, options.endpoint, {
          requestTimeoutMs: options.requestTimeoutMs,
        });
      } catch (error) {
        const retryDelayMs = buildRetryDelayMs(error);

        if (retryDelayMs > 0) {
          stats.retriedGroups += 1;
          await sleep(retryDelayMs);
          dynamicThrottleMs = Math.min(dynamicThrottleMs + 2000, 60000);
          uploadResults = await uploadGroup(group, options.endpoint, {
            requestTimeoutMs: options.requestTimeoutMs,
          });
        } else {
          throw error;
        }
      }

      const chapterResultMap = normalizeChapterUploadResults(group, uploadResults);
      const dbStats = syncChapterCdnUrlsToDb(chapterResultMap);
      const persistedKeys = new Set(dbStats.updatedKeys);
      const persistedMap = {};

      for (const key of dbStats.updatedKeys) {
        if (chapterResultMap[key]) {
          persistedMap[key] = chapterResultMap[key];
        }
      }

      Object.assign(mergedMap, persistedMap);
      await saveMap(mapFile, mergedMap);
      if (dbStats.updatedKeys.length > 0) {
        checkpointDatabaseForExternalReaders();
      }

      const removableEntries = group.filter((entry) => persistedKeys.has(entry.key));
      if (options.deleteLocal && removableEntries.length > 0) {
        stats.deletedLocal += await removeUploadedLocalFiles(chaptersRoot, removableEntries);
      }

      stats.uploaded += Object.keys(chapterResultMap).length;
      stats.dbUpdated += dbStats.updated;
      stats.dbMissingRows += dbStats.skippedMissingRows;

      for (const entry of group) {
        if (persistedKeys.has(entry.key)) {
          items.push({ key: entry.key, status: 'migrated' });
        } else if (chapterResultMap[entry.key]) {
          items.push({ key: entry.key, status: 'uploaded_but_db_missing' });
        } else {
          items.push({ key: entry.key, status: 'upload_result_missing_src' });
        }
      }

      dynamicThrottleMs = Math.max(baseThrottleMs, dynamicThrottleMs - 500);
    } catch (error) {
      stats.failedGroups += 1;
      items.push(...group.map((entry) => ({
        key: entry.key,
        status: 'failed',
        error: error.message,
      })));
    }
  }

  await writeTaskReport(reportPath, {
    task: 'upload-biquge-chapter-cdn',
    status: stats.failedGroups > 0 ? 'partial' : 'success',
    summary: {
      pendingFiles: pendingEntries.length,
      uploaded: stats.uploaded,
      dbUpdated: stats.dbUpdated,
      dbMissingRows: stats.dbMissingRows,
      deletedLocal: stats.deletedLocal,
      failedGroups: stats.failedGroups,
      retriedGroups: stats.retriedGroups,
    },
    items: items.slice(0, 500),
  });

  return {
    ...state,
    stats,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const result = await uploadBiqugeChapterCdn(options);

  console.log('章节 CDN 迁移脚本已就绪');
  console.log(`待处理文件数: ${result.pendingEntries.length}`);
  console.log(`待处理分组数: ${result.groups.length}`);
  console.log(`映射文件: ${result.mapFile}`);
  console.log(`报告文件: ${result.reportPath}`);

  if (!options.endpoint) {
    console.log('未提供 --endpoint，本次仅生成待处理报告。');
    return;
  }

  console.log(`上传成功数: ${result.stats.uploaded}`);
  console.log(`DB 更新数: ${result.stats.dbUpdated}`);
  console.log(`DB 缺失行数: ${result.stats.dbMissingRows}`);
  console.log(`删除本地文件数: ${result.stats.deletedLocal}`);
  console.log(`失败分组数: ${result.stats.failedGroups}`);
  console.log(`限流重试分组数: ${result.stats.retriedGroups}`);
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
  absolutizeSrc,
  buildChapterMapKey,
  buildRetryDelayMs,
  chunkFiles,
  normalizeChapterUploadResults,
  parseArgs,
  parseChapterMapKey,
  pickPendingEntries,
  readJsonIfExists,
  removeUploadedLocalFiles,
  saveMap,
  scanChapterFiles,
  checkpointDatabaseForExternalReaders,
  syncChapterCdnUrlsToDb,
  uploadBiqugeChapterCdn,
  uploadGroup,
};

/*
用法示例：

# 仅生成待处理计划（不上传）
node backend/upload-biquge-chapter-cdn.js \
  --root storage/json/biquge

# 小样本迁移，成功后删除本地章节 JSON
node backend/upload-biquge-chapter-cdn.js \
  --root storage/json/biquge \
  --endpoint https://aixs.us.ci/upload \
  --limit 100 \
  --batch-size 10 \
  --request-timeout-ms 20000 \
  --delete-local
*/

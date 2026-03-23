#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { getTargetConfig } = require('./novel-targets');

const execFileAsync = promisify(execFile);
const DEFAULT_API_HOST = 'https://apiqu.cc';
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CONCURRENCY = 24;
const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_START_ID = 1;
const DEFAULT_END_ID = 200243;

// 使用示例：
// 1. 按默认范围抓取全库书目、目录和封面
//    node backend/apiqu-range-export.js
// 2. 指定更小范围做冒烟验证
//    node backend/apiqu-range-export.js --start-id 1 --end-id 1000
// 3. 调整并发和批次大小
//    node backend/apiqu-range-export.js --concurrency 32 --batch-size 1000

function buildCoverUrl(imageHost, bookId) {
  const numericBookId = Number(bookId);
  return `${imageHost}/bookimg/${Math.floor(numericBookId / 1000)}/${numericBookId}.jpg`;
}

function buildBookJsonPath(outputDir, bookId) {
  return path.join(outputDir, 'books', `${Number(bookId)}.json`);
}

function buildCoverPath(outputDir, bookId) {
  return path.join(outputDir, 'covers', `${Number(bookId)}.jpg`);
}

function chunkRange(startId, endId, batchSize) {
  const chunks = [];
  for (let start = startId; start <= endId; start += batchSize) {
    chunks.push({
      start,
      end: Math.min(endId, start + batchSize - 1),
    });
  }
  return chunks;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const defaultTarget = getTargetConfig('bige7');
  const options = {
    target: defaultTarget,
    outputDir: defaultTarget.outputDir,
    apiHost: DEFAULT_API_HOST,
    startId: DEFAULT_START_ID,
    endId: DEFAULT_END_ID,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    batchSize: DEFAULT_BATCH_SIZE,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    switch (current) {
      case '--target':
        options.target = getTargetConfig(args[index + 1] || 'bige7');
        options.outputDir = options.target.outputDir;
        index += 1;
        break;
      case '--output':
        options.outputDir = path.resolve(args[index + 1] || options.outputDir);
        index += 1;
        break;
      case '--api-host':
        options.apiHost = args[index + 1] || DEFAULT_API_HOST;
        index += 1;
        break;
      case '--start-id':
        options.startId = Math.max(1, Number(args[index + 1]) || DEFAULT_START_ID);
        index += 1;
        break;
      case '--end-id':
        options.endId = Math.max(options.startId, Number(args[index + 1]) || DEFAULT_END_ID);
        index += 1;
        break;
      case '--timeout':
        options.timeoutMs = Math.max(1000, Number(args[index + 1]) || DEFAULT_TIMEOUT_MS);
        index += 1;
        break;
      case '--concurrency':
        options.concurrency = Math.max(1, Number(args[index + 1]) || DEFAULT_CONCURRENCY);
        index += 1;
        break;
      case '--batch-size':
        options.batchSize = Math.max(1, Number(args[index + 1]) || DEFAULT_BATCH_SIZE);
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

  if (options.endId < options.startId) {
    options.endId = options.startId;
  }

  return options;
}

function printHelp() {
  console.log(`
APIQU 书库区间导出工具

用法:
  node backend/apiqu-range-export.js [--start-id 1] [--end-id 200243]

选项:
  --target       目标站点，默认 bige7
  --output       输出目录，默认目标站配置目录
  --api-host     元数据接口主机，默认 https://apiqu.cc
  --start-id     起始 book id，默认 1
  --end-id       结束 book id，默认 200243
  --timeout      单次请求超时毫秒数，默认 15000
  --concurrency  并发数，默认 24
  --batch-size   批次大小，默认 500

示例:
  node backend/apiqu-range-export.js
  node backend/apiqu-range-export.js --start-id 1 --end-id 1000
  node backend/apiqu-range-export.js --concurrency 32 --batch-size 1000
`);
}

function buildRequestHeaders(target) {
  return {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'accept': 'application/json,text/plain,*/*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'referer': `${target.site}/`,
  };
}

async function requestJson(target, url, timeoutMs) {
  const parsedUrl = new URL(url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      parsedUrl,
      {
        method: 'GET',
        headers: buildRequestHeaders(target),
      },
      (res) => {
        const chunks = [];

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');

          if (res.statusCode === 403 && body.length === 0) {
            resolve(null);
            return;
          }

          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`请求失败: ${res.statusCode || 0}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时: ${url}`));
    });
    req.on('error', reject);
    req.end();
  });
}

async function ensureOutputDirs(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, 'books'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'covers'), { recursive: true });
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function downloadCover(target, outputDir, bookId, timeoutMs) {
  const coverPath = buildCoverPath(outputDir, bookId);
  const coverUrl = buildCoverUrl(target.imageHost, bookId);
  const headers = buildRequestHeaders(target);

  await execFileAsync(
    'curl',
    [
      '-k',
      '-L',
      '--max-time',
      String(Math.ceil(timeoutMs / 1000)),
      coverUrl,
      '-H',
      `user-agent: ${headers['user-agent']}`,
      '-H',
      `accept: */*`,
      '-H',
      `accept-language: ${headers['accept-language']}`,
      '-H',
      `referer: ${headers.referer}`,
      '-o',
      coverPath,
    ],
    {
      maxBuffer: 1024 * 1024 * 10,
    }
  );

  return coverPath;
}

function normalizeBookPayload(target, outputDir, bookDetail, chapterTitles, fetchedAt) {
  const bookId = Number(bookDetail.id);

  return {
    site: target.site,
    bookId,
    title: bookDetail.title || '',
    author: bookDetail.author || '',
    category: bookDetail.sortname || '',
    status: bookDetail.full || '',
    intro: bookDetail.intro || '',
    lastUpdate: bookDetail.lastupdate || '',
    lastChapter: {
      chapterId: Number(bookDetail.lastchapterid || 0),
      title: bookDetail.lastchapter || '',
    },
    cover: {
      originalUrl: buildCoverUrl(target.imageHost, bookId),
      localPath: path.relative(process.cwd(), buildCoverPath(outputDir, bookId)).split(path.sep).join('/'),
    },
    chapterCount: Array.isArray(chapterTitles) ? chapterTitles.length : 0,
    chapters: (Array.isArray(chapterTitles) ? chapterTitles : []).map((title, index) => ({
      chapterNumber: index + 1,
      title,
      url: `${target.site}/book/${bookId}/${index + 1}.html`,
    })),
    fetchedAt,
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length || 1) },
    () => consume()
  );
  await Promise.all(workers);
}

async function processSingleBookId(options, bookId) {
  const bookJsonPath = buildBookJsonPath(options.outputDir, bookId);

  if (await fileExists(bookJsonPath)) {
    return { status: 'skipped', bookId };
  }

  const bookDetail = await requestJson(
    options.target,
    `${options.apiHost}/api/book?id=${bookId}`,
    options.timeoutMs
  );

  // 空号或无效号直接跳过，不记为错误。
  if (!bookDetail || !bookDetail.id || !bookDetail.title) {
    return { status: 'invalid', bookId };
  }

  const chapterPayload = await requestJson(
    options.target,
    `${options.apiHost}/api/booklist?id=${bookDetail.dirid || bookId}`,
    options.timeoutMs
  );
  const chapterTitles = Array.isArray(chapterPayload?.list) ? chapterPayload.list : [];
  await downloadCover(options.target, options.outputDir, bookId, options.timeoutMs);

  const payload = normalizeBookPayload(
    options.target,
    options.outputDir,
    bookDetail,
    chapterTitles,
    new Date().toISOString()
  );

  await fs.writeFile(
    bookJsonPath,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8'
  );

  return {
    status: 'success',
    bookId,
    chapterCount: payload.chapterCount,
  };
}

async function writeProgress(outputDir, payload) {
  await fs.writeFile(
    path.join(outputDir, 'range-progress.json'),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8'
  );
}

async function writeErrors(outputDir, errors) {
  await fs.writeFile(
    path.join(outputDir, 'range-errors.json'),
    `${JSON.stringify(errors, null, 2)}\n`,
    'utf8'
  );
}

async function writeSummary(options, progress) {
  const summary = {
    site: options.target.site,
    apiHost: options.apiHost,
    startId: options.startId,
    endId: options.endId,
    fetchedAt: new Date().toISOString(),
    scannedCount: progress.scannedCount,
    successCount: progress.successCount,
    skippedCount: progress.skippedCount,
    invalidCount: progress.invalidCount,
    errorCount: progress.errorCount,
    chapterTotal: progress.chapterTotal,
  };

  await fs.writeFile(
    path.join(options.outputDir, 'index.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  );
}

async function exportRange(options) {
  await ensureOutputDirs(options.outputDir);

  const batches = chunkRange(options.startId, options.endId, options.batchSize);
  const errors = [];
  const progress = {
    site: options.target.site,
    apiHost: options.apiHost,
    startId: options.startId,
    endId: options.endId,
    currentBatch: 0,
    batchCount: batches.length,
    lastProcessedId: options.startId - 1,
    scannedCount: 0,
    successCount: 0,
    skippedCount: 0,
    invalidCount: 0,
    errorCount: 0,
    chapterTotal: 0,
    updatedAt: new Date().toISOString(),
  };

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex];
    const ids = [];

    for (let id = batch.start; id <= batch.end; id += 1) {
      ids.push(id);
    }

    await runWithConcurrency(ids, options.concurrency, async (bookId) => {
      try {
        const result = await processSingleBookId(options, bookId);
        progress.scannedCount += 1;

        if (result.status === 'success') {
          progress.successCount += 1;
          progress.chapterTotal += Number(result.chapterCount || 0);
        } else if (result.status === 'skipped') {
          progress.skippedCount += 1;
        } else if (result.status === 'invalid') {
          progress.invalidCount += 1;
        }
      } catch (error) {
        progress.scannedCount += 1;
        progress.errorCount += 1;
        errors.push({
          bookId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    progress.currentBatch = batchIndex + 1;
    progress.lastProcessedId = batch.end;
    progress.updatedAt = new Date().toISOString();
    await writeProgress(options.outputDir, progress);
    await writeErrors(options.outputDir, errors);
    await writeSummary(options, progress);
  }

  return progress;
}

async function main() {
  const options = parseArgs(process.argv);
  const progress = await exportRange(options);

  console.log('导出完成');
  console.log(`输出目录: ${path.relative(process.cwd(), options.outputDir)}`);
  console.log(`扫描: ${progress.scannedCount}`);
  console.log(`成功: ${progress.successCount}`);
  console.log(`跳过: ${progress.skippedCount}`);
  console.log(`空号: ${progress.invalidCount}`);
  console.log(`错误: ${progress.errorCount}`);
}

module.exports = {
  buildCoverUrl,
  buildBookJsonPath,
  buildCoverPath,
  chunkRange,
  parseArgs,
  exportRange,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('导出失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  buildBookJsonPath,
  buildCoverPath,
  buildCoverUrl,
  parseArgs: parseRangeArgs,
} = require('./apiqu-range-export');
const { getTargetConfig } = require('./novel-targets');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const https = require('node:https');

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CONCURRENCY = 16;

// 使用示例：
// 1. 重试全部失败 bookId
//    node backend/apiqu-range-retry.js
// 2. 只重试前 500 条
//    node backend/apiqu-range-retry.js --limit 500

function dedupeErrorsByBookId(errors) {
  const map = new Map();
  for (const item of errors) {
    map.set(Number(item.bookId), item);
  }
  return [...map.values()].sort((a, b) => Number(a.bookId) - Number(b.bookId));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const defaultTarget = getTargetConfig('bige7');
  const options = {
    target: defaultTarget,
    outputDir: defaultTarget.outputDir,
    apiHost: 'https://apiqu.cc',
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    limit: 0,
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
        options.apiHost = args[index + 1] || options.apiHost;
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
      case '--limit':
        options.limit = Math.max(0, Number(args[index + 1]) || 0);
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
APIQU 区间失败补抓工具

用法:
  node backend/apiqu-range-retry.js [--limit 500]

选项:
  --target       目标站点，默认 bige7
  --output       输出目录，默认目标站配置目录
  --api-host     元数据接口主机，默认 https://apiqu.cc
  --timeout      单次请求超时毫秒数，默认 15000
  --concurrency  并发数，默认 16
  --limit        只处理前 N 条失败记录，默认 0 表示全部
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
      'accept: */*',
      '-H',
      `accept-language: ${headers['accept-language']}`,
      '-H',
      `referer: ${headers.referer}`,
      '-o',
      coverPath,
    ],
    { maxBuffer: 1024 * 1024 * 10 }
  );
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
      const current = items[cursor];
      cursor += 1;
      await worker(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => consume()));
}

async function refreshIndex(outputDir, apiHost) {
  const booksDir = path.join(outputDir, 'books');
  const files = (await fs.readdir(booksDir)).filter((f) => f.endsWith('.json'));
  let chapterTotal = 0;
  for (const file of files) {
    const data = JSON.parse(await fs.readFile(path.join(booksDir, file), 'utf8'));
    chapterTotal += Number(data.chapterCount || 0);
  }
  const summary = {
    site: getTargetConfig('bige7').site,
    apiHost,
    fetchedAt: new Date().toISOString(),
    successCount: files.length,
    chapterTotal,
  };
  await fs.writeFile(path.join(outputDir, 'index.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}

async function retryRangeErrors(options) {
  const errorPath = path.join(options.outputDir, 'range-errors.json');
  const rawErrors = JSON.parse(await fs.readFile(errorPath, 'utf8'));
  const dedupedErrors = dedupeErrorsByBookId(rawErrors);
  const selected = options.limit > 0 ? dedupedErrors.slice(0, options.limit) : dedupedErrors;
  const retriedIds = new Set(selected.map((item) => Number(item.bookId)));
  const remainingErrors = [];
  let successCount = 0;

  await runWithConcurrency(selected, options.concurrency, async (item) => {
    const bookId = Number(item.bookId);
    try {
      const bookDetail = await requestJson(
        options.target,
        `${options.apiHost}/api/book?id=${bookId}`,
        options.timeoutMs
      );

      if (!bookDetail || !bookDetail.id || !bookDetail.title) {
        return;
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
        buildBookJsonPath(options.outputDir, bookId),
        `${JSON.stringify(payload, null, 2)}\n`,
        'utf8'
      );
      successCount += 1;
    } catch (error) {
      remainingErrors.push({
        bookId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  for (const item of dedupedErrors) {
    if (!retriedIds.has(Number(item.bookId))) {
      remainingErrors.push(item);
    }
  }

  await fs.writeFile(errorPath, `${JSON.stringify(remainingErrors, null, 2)}\n`, 'utf8');
  await refreshIndex(options.outputDir, options.apiHost);

  return {
    total: dedupedErrors.length,
    attempted: selected.length,
    success: successCount,
    failed: remainingErrors.length,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const result = await retryRangeErrors(options);
  console.log('补抓完成');
  console.log(`总失败记录: ${result.total}`);
  console.log(`本轮尝试: ${result.attempted}`);
  console.log(`成功补齐: ${result.success}`);
  console.log(`剩余失败: ${result.failed}`);
}

module.exports = {
  dedupeErrorsByBookId,
  parseArgs,
  retryRangeErrors,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('补抓失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

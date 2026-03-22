#!/usr/bin/env node

const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { PROJECT_ROOT, getTargetConfig } = require('./novel-targets');

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CONCURRENCY = 8;

// 使用示例：
// 1. 重试当前 chapter-errors.json 里的全部失败章节
//    node backend/biquge-retry-chapter-errors.js
// 2. 只重试前 20 条失败章节做验证
//    node backend/biquge-retry-chapter-errors.js --limit 20
// 3. 自定义并发和超时
//    node backend/biquge-retry-chapter-errors.js --concurrency 4 --timeout 20000

function buildChapterUrl(target, bookId, chapterNumber) {
  return `${target.site}/book/${Number(bookId)}/${Number(chapterNumber)}.html`;
}

function buildChapterApiUrl(bookId, chapterNumber, apiHost = getTargetConfig('biquge').chapterApiHost) {
  return `${apiHost}/api/chapter?id=${Number(bookId)}&chapterid=${Number(chapterNumber)}`;
}

function normalizeChapterPayload({
  target,
  site,
  apiHost,
  bookId,
  chapterNumber,
  chapterApiPayload,
  bookTitle,
  author,
  fetchedAt,
}) {
  return {
    site,
    apiHost,
    bookId: Number(bookId),
    bookTitle: bookTitle || chapterApiPayload.title || '',
    author: author || chapterApiPayload.author || '',
    chapterNumber: Number(chapterNumber),
    title: chapterApiPayload.chaptername || '',
    sourceUrl: buildChapterUrl(target, bookId, chapterNumber),
    pageUrls: [buildChapterApiUrl(bookId, chapterNumber, apiHost)],
    content: chapterApiPayload.txt || '',
    fetchedAt,
  };
}

function dedupeChapterErrors(errors) {
  const unique = new Map();
  for (const item of errors) {
    unique.set(`${item.bookId}:${item.chapterNumber}`, item);
  }
  return [...unique.values()];
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const defaultTarget = getTargetConfig('biquge');
  const options = {
    target: defaultTarget,
    outputDir: defaultTarget.outputDir,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    site: defaultTarget.site,
    chapterApiHost: defaultTarget.chapterApiHost,
    limit: 0,
    scanMissing: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    switch (current) {
      case '--output':
        options.outputDir = path.resolve(PROJECT_ROOT, args[index + 1] || options.target.outputDir);
        index += 1;
        break;
      case '--target':
        options.target = getTargetConfig(args[index + 1] || 'biquge');
        options.outputDir = options.target.outputDir;
        options.site = options.target.site;
        options.chapterApiHost = options.target.chapterApiHost;
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
      case '--scan-missing':
        options.scanMissing = true;
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
失败章节重试工具

用法:
  node backend/biquge-retry-chapter-errors.js [--limit 100]

选项:
  --output       输出目录，默认 ./storage/json/biquge
  --timeout      单次请求超时毫秒数，默认 15000
  --concurrency  并发数，默认 8
  --limit        只处理前 N 条失败记录，默认 0 表示全部处理
  --scan-missing 不读 chapter-errors.json，直接扫描 books 与 chapters 的缺口

示例:
  node backend/biquge-retry-chapter-errors.js
  node backend/biquge-retry-chapter-errors.js --limit 20
  node backend/biquge-retry-chapter-errors.js --concurrency 4 --timeout 20000
  node backend/biquge-retry-chapter-errors.js --scan-missing
`);
}

async function requestJson(target, url, timeoutMs) {
  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const req = client.request(
      parsedUrl,
      {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          'accept': 'application/json,text/plain,*/*',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'referer': `${target.site}/`,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`请求失败: ${res.statusCode || 0}`));
            return;
          }
          resolve(JSON.parse(body));
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

async function runWithConcurrency(items, concurrency, worker) {
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const current = items[cursor];
      cursor += 1;
      await worker(current);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length || 1) },
    () => consume()
  );
  await Promise.all(workers);
}

async function loadBookMap(outputDir) {
  const booksDir = path.join(outputDir, 'books');
  const files = (await fs.readdir(booksDir)).filter((file) => file.endsWith('.json'));
  const bookMap = new Map();

  for (const file of files) {
    const payload = JSON.parse(await fs.readFile(path.join(booksDir, file), 'utf8'));
    bookMap.set(Number(payload.bookId), payload);
  }

  return bookMap;
}

async function buildMissingChapterErrors(outputDir) {
  const bookMap = await loadBookMap(outputDir);
  const missing = [];

  for (const book of bookMap.values()) {
    const chapterDir = path.join(outputDir, 'chapters', `${book.bookId}`);
    const existing = new Set();

    try {
      for (const name of await fs.readdir(chapterDir)) {
        if (!name.endsWith('.json')) {
          continue;
        }
        existing.add(Number(path.basename(name, '.json')));
      }
    } catch {
      // 目录不存在表示整本正文都还没落盘，下面会按完整目录补齐。
    }

    for (const chapter of book.chapters || []) {
      if (existing.has(Number(chapter.chapterNumber))) {
        continue;
      }
      missing.push({
        bookId: book.bookId,
        title: book.title,
        chapterNumber: Number(chapter.chapterNumber),
        chapterTitle: chapter.title || '',
        error: '缺少章节文件',
      });
    }
  }

  return missing;
}

async function rebuildChapterIndex(options, chapterErrors) {
  const outputDir = options.outputDir;
  const booksDir = path.join(outputDir, 'books');
  const chapterRootDir = path.join(outputDir, 'chapters');
  const files = (await fs.readdir(booksDir)).filter((file) => file.endsWith('.json'));
  const books = [];

  for (const file of files) {
    const payload = JSON.parse(await fs.readFile(path.join(booksDir, file), 'utf8'));
    const chapterDir = path.join(chapterRootDir, `${payload.bookId}`);
    let actualCount = 0;

    try {
      actualCount = (await fs.readdir(chapterDir)).filter((name) => name.endsWith('.json')).length;
    } catch {
      actualCount = 0;
    }

    const errorCount = chapterErrors.filter((item) => Number(item.bookId) === Number(payload.bookId)).length;
    books.push({
      bookId: payload.bookId,
      title: payload.title,
      chapterCount: payload.chapterCount,
      actualChapterFileCount: actualCount,
      errorCount,
      chapterDir: `storage/json/biquge/chapters/${payload.bookId}`,
    });
  }

  const chapterIndexPayload = {
    site: options.site,
    chapterApiHost: options.chapterApiHost,
    fetchedAt: new Date().toISOString(),
    bookCount: books.length,
    chapterBookCount: books.filter((item) => item.actualChapterFileCount > 0).length,
    chapterErrorCount: chapterErrors.length,
    books,
  };

  await fs.writeFile(
    path.join(outputDir, 'chapter-index.json'),
    `${JSON.stringify(chapterIndexPayload, null, 2)}\n`,
    'utf8'
  );
}

async function retryChapterErrors(options) {
  const errorPath = path.join(options.outputDir, 'chapter-errors.json');
  const rawErrors = options.scanMissing
    ? await buildMissingChapterErrors(options.outputDir)
    : JSON.parse(await fs.readFile(errorPath, 'utf8'));
  const chapterErrors = dedupeChapterErrors(rawErrors);
  const selectedErrors = options.limit > 0 ? chapterErrors.slice(0, options.limit) : chapterErrors;
  const bookMap = await loadBookMap(options.outputDir);
  const remainingErrors = [];
  let successCount = 0;

  await runWithConcurrency(selectedErrors, options.concurrency, async (item) => {
    const book = bookMap.get(Number(item.bookId));
    const chapterDir = path.join(options.outputDir, 'chapters', `${item.bookId}`);
    const targetPath = path.join(chapterDir, `${item.chapterNumber}.json`);

    await fs.mkdir(chapterDir, { recursive: true });

    try {
      const payload = await requestJson(
        options.target,
        buildChapterApiUrl(item.bookId, item.chapterNumber, options.chapterApiHost),
        options.timeoutMs
      );
      const chapterPayload = normalizeChapterPayload({
        target: options.target,
        site: options.site,
        apiHost: options.chapterApiHost,
        bookId: item.bookId,
        chapterNumber: item.chapterNumber,
        chapterApiPayload: payload,
        bookTitle: book?.title || item.title || '',
        author: book?.author || '',
        fetchedAt: new Date().toISOString(),
      });
      await fs.writeFile(targetPath, `${JSON.stringify(chapterPayload, null, 2)}\n`, 'utf8');
      successCount += 1;
    } catch (error) {
      remainingErrors.push({
        ...item,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // 未参与本轮重试的失败记录直接保留，避免只跑 --limit 时误清空。
  if (options.limit > 0 && chapterErrors.length > selectedErrors.length) {
    remainingErrors.push(...chapterErrors.slice(selectedErrors.length));
  }

  await fs.writeFile(
    errorPath,
    `${JSON.stringify(remainingErrors, null, 2)}\n`,
    'utf8'
  );
  await rebuildChapterIndex(options, remainingErrors);

  return {
    total: chapterErrors.length,
    attempted: selectedErrors.length,
    success: successCount,
    failed: remainingErrors.length,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const result = await retryChapterErrors(options);

  console.log('重试完成');
  console.log(`总失败记录: ${result.total}`);
  console.log(`本轮尝试: ${result.attempted}`);
  console.log(`成功补齐: ${result.success}`);
  console.log(`剩余失败: ${result.failed}`);
}

module.exports = {
  buildChapterApiUrl,
  buildChapterUrl,
  getTargetConfig,
  dedupeChapterErrors,
  normalizeChapterPayload,
  parseArgs,
  retryChapterErrors,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('重试失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

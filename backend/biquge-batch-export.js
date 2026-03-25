#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');
const { getTargetConfig } = require('./novel-targets');
const {
  buildChapterApiUrl,
  normalizeChapterPayload,
} = require('./biquge-export');

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_LIMIT = 1000;

// 使用示例：
// 1. 从 all 中切下一批 1000 本到 biquge2，并抓正文
//    node backend/biquge-batch-export.js --limit 1000
// 2. 指定输出批次目录和批次名
//    node backend/biquge-batch-export.js --output-dir ./storage/json/biquge2 --batch-name biquge2 --limit 5000

function parseArgs(argv) {
  const args = argv.slice(2);
  const sourceTarget = getTargetConfig('all');
  const outputTarget = getTargetConfig('biquge');
  const options = {
    sourceDir: sourceTarget.outputDir,
    outputDir: path.join(path.dirname(outputTarget.outputDir), 'biquge2'),
    batchName: 'biquge2',
    chapterApiHost: sourceTarget.chapterApiHost,
    site: outputTarget.site,
    limit: DEFAULT_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    switch (current) {
      case '--source-dir':
        options.sourceDir = path.resolve(args[index + 1] || options.sourceDir);
        index += 1;
        break;
      case '--output-dir':
        options.outputDir = path.resolve(args[index + 1] || options.outputDir);
        index += 1;
        break;
      case '--batch-name':
        options.batchName = args[index + 1] || options.batchName;
        index += 1;
        break;
      case '--limit':
        options.limit = Math.max(1, Number(args[index + 1]) || DEFAULT_LIMIT);
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
批次正文导出工具

用法:
  node backend/biquge-batch-export.js [--limit 1000]

选项:
  --source-dir   全库元数据目录，默认 ./storage/json/all
  --output-dir   当前批次输出目录，默认 ./storage/json/biquge2
  --batch-name   批次标识，默认 biquge2
  --limit        当前批次抓取本数，默认 1000
  --timeout      单次请求超时毫秒数，默认 15000
  --concurrency  正文抓取并发数，默认 8
`);
}

function pickNextBatchBooks(allBooks, existingIds, limit) {
  const result = [];
  for (const book of allBooks) {
    if (existingIds.has(String(book.bookId))) {
      continue;
    }
    result.push(book);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function withStorageBatch(payload, batchName) {
  return {
    ...payload,
    storage_batch: batchName,
  };
}

async function ensureOutputDirs(outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, 'books'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'chapters'), { recursive: true });
}

async function requestJson(url, timeoutMs) {
  const https = require('node:https');
  return new Promise((resolve, reject) => {
    const req = https.request(
      new URL(url),
      {
        method: 'GET',
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
          'accept': 'application/json,text/plain,*/*',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'referer': 'https://www.bqg291.cc/',
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

async function loadExistingIds(dirs) {
  const ids = new Set();
  for (const dir of dirs) {
    try {
      const files = (await fs.readdir(path.join(dir, 'books'))).filter((file) => file.endsWith('.json'));
      for (const file of files) ids.add(file.replace('.json', ''));
    } catch {
      // 忽略不存在的批次目录。
    }
  }
  return ids;
}

async function selectNextBatchBooks(sourceDir, existingIds, limit) {
  const files = (await fs.readdir(path.join(sourceDir, 'books')))
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => Number(a.replace('.json', '')) - Number(b.replace('.json', '')));
  const books = [];

  for (const file of files) {
    const bookId = file.replace('.json', '');
    if (existingIds.has(bookId)) {
      continue;
    }
    const payload = JSON.parse(
      await fs.readFile(path.join(sourceDir, 'books', file), 'utf8')
    );
    books.push(payload);
    if (books.length >= limit) {
      break;
    }
  }

  return books;
}

async function copyBookPayload(book, outputDir, batchName) {
  const nextPayload = withStorageBatch(book, batchName);
  delete nextPayload.cover;
  await fs.writeFile(
    path.join(outputDir, 'books', `${book.bookId}.json`),
    `${JSON.stringify(nextPayload, null, 2)}\n`,
    'utf8'
  );
  return nextPayload;
}

async function exportBatch(options) {
  await ensureOutputDirs(options.outputDir);
  const storageRoot = path.dirname(options.outputDir);
  const candidateDirs = await fs.readdir(storageRoot);
  const existingIds = await loadExistingIds(
    candidateDirs
      .filter((name) => name === path.basename(options.outputDir) || /^biquge\d*$/.test(name))
      .map((name) => path.join(storageRoot, name))
  );
  const selected = await selectNextBatchBooks(options.sourceDir, existingIds, options.limit);
  const target = getTargetConfig('all');
  const books = [];
  const errors = [];

  for (const book of selected) {
    const payload = await copyBookPayload(book, options.outputDir, options.batchName);
    books.push({
      bookId: payload.bookId,
      title: payload.title,
      chapterCount: payload.chapterCount,
      storage_batch: payload.storage_batch,
    });
  }

  await runWithConcurrency(selected, options.concurrency, async (book) => {
    const chapterDir = path.join(options.outputDir, 'chapters', `${book.bookId}`);
    await fs.mkdir(chapterDir, { recursive: true });
    await runWithConcurrency(book.chapters || [], options.concurrency, async (chapter) => {
      try {
        const chapterApiPayload = await requestJson(
          buildChapterApiUrl(target, book.bookId, chapter.chapterNumber),
          options.timeoutMs
        );
        const chapterPayload = normalizeChapterPayload({
          target,
          site: options.site,
          apiHost: options.chapterApiHost,
          bookId: book.bookId,
          chapterNumber: chapter.chapterNumber,
          chapterApiPayload,
          pageUrls: [buildChapterApiUrl(target, book.bookId, chapter.chapterNumber)],
          bookTitle: book.title,
          author: book.author,
          fetchedAt: new Date().toISOString(),
        });
        await fs.writeFile(
          path.join(chapterDir, `${chapter.chapterNumber}.json`),
          `${JSON.stringify(chapterPayload, null, 2)}\n`,
          'utf8'
        );
      } catch (error) {
        errors.push({
          bookId: book.bookId,
          chapterNumber: chapter.chapterNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });

  await fs.writeFile(
    path.join(options.outputDir, 'index.json'),
    `${JSON.stringify({
      batchName: options.batchName,
      sourceDir: path.relative(process.cwd(), options.sourceDir).split(path.sep).join('/'),
      fetchedAt: new Date().toISOString(),
      successCount: books.length,
      errorCount: errors.length,
      books,
    }, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(options.outputDir, 'chapter-errors.json'),
    `${JSON.stringify(errors, null, 2)}\n`,
    'utf8'
  );

  return {
    successCount: books.length,
    errorCount: errors.length,
  };
}

async function main() {
  const options = parseArgs(process.argv);
  const result = await exportBatch(options);
  console.log('导出完成');
  console.log(`输出目录: ${path.relative(process.cwd(), options.outputDir)}`);
  console.log(`成功: ${result.successCount}`);
  console.log(`错误: ${result.errorCount}`);
}

module.exports = {
  pickNextBatchBooks,
  parseArgs,
  withStorageBatch,
  exportBatch,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('导出失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

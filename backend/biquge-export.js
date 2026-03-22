#!/usr/bin/env node

const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { PROJECT_ROOT, getTargetConfig } = require('./novel-targets');

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_LIMIT = 100;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_CONTENT_CONCURRENCY = 8;
const execFileAsync = promisify(execFile);

function buildRequestHeaders(target, url) {
  const parsedUrl = new URL(url);
  const baseHeaders = {
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
  };

  const sourceHost = new URL(target.sourceApiHost || target.site).hostname;
  const siteHost = new URL(target.site).hostname;

  if (parsedUrl.hostname === sourceHost || parsedUrl.hostname === siteHost) {
    return {
      ...baseHeaders,
      'accept': 'application/json,text/plain,*/*',
      'referer': `${target.site}/`,
    };
  }

  return {
    ...baseHeaders,
    'accept': '*/*',
    'referer': `${target.site}/`,
  };
}

// 使用示例：
// 1. 抓取最新更新的 100 本小说
//    node backend/biquge-export.js
// 2. 先抓取 1 本做冒烟测试
//    node backend/biquge-export.js --limit 1
// 3. 自定义输出目录
//    node backend/biquge-export.js --output ./storage/json/biquge
// 4. 为已抓取的小说补抓正文
//    node backend/biquge-export.js --with-content
// 5. 先抓 1 本小说的全部正文做验证
//    node backend/biquge-export.js --limit 1 --with-content

function buildCoverUrl(target, bookId) {
  const numericBookId = Number(bookId);
  return `${target.imageHost}/bookimg/${Math.floor(numericBookId / 1000)}/${numericBookId}.jpg`;
}

function buildChapterUrl(target, bookId, chapterNumber) {
  return `${target.site}/book/${Number(bookId)}/${Number(chapterNumber)}.html`;
}

function buildChapterApiUrl(target, bookId, chapterNumber) {
  return `${target.chapterApiHost}/api/chapter?id=${Number(bookId)}&chapterid=${Number(chapterNumber)}`;
}

function normalizeBookPayload({
  target,
  site,
  bookSummary,
  bookDetail,
  chapterTitles,
  fetchedAt,
  coverLocalPath,
}) {
  const bookId = Number(bookDetail.id || bookSummary.id);
  const normalizedTitles = Array.isArray(chapterTitles) ? chapterTitles : [];

  return {
    site,
    bookId,
    title: bookDetail.title || bookSummary.title || '',
    author: bookDetail.author || bookSummary.author || '',
    category: bookDetail.sortname || '',
    status: bookDetail.full || '',
    intro: bookDetail.intro || bookSummary.intro || '',
    lastUpdate: bookDetail.lastupdate || '',
    lastChapter: {
      chapterId: Number(bookDetail.lastchapterid || 0),
      title: bookDetail.lastchapter || '',
    },
    cover: {
      originalUrl: buildCoverUrl(target, bookId),
      localPath: coverLocalPath,
    },
    chapterCount: normalizedTitles.length,
    chapters: normalizedTitles.map((title, index) => ({
      chapterNumber: index + 1,
      title,
      url: buildChapterUrl(target, bookId, index + 1),
    })),
    fetchedAt,
  };
}

function normalizeChapterPayload({
  target,
  site,
  apiHost,
  bookId,
  chapterNumber,
  chapterApiPayload,
  pageUrls,
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
    pageUrls: Array.isArray(pageUrls) ? pageUrls : [],
    content: chapterApiPayload.txt || '',
    fetchedAt,
  };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    limit: DEFAULT_LIMIT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    contentConcurrency: DEFAULT_CONTENT_CONCURRENCY,
    target: getTargetConfig('biquge'),
    outputDir: getTargetConfig('biquge').outputDir,
    site: getTargetConfig('biquge').site,
    sourceApiHost: getTargetConfig('biquge').sourceApiHost,
    chapterApiHost: getTargetConfig('biquge').chapterApiHost,
    withContent: false,
    skipExistingContent: true,
    allCategories: false,
    categories: ['index'],
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    switch (current) {
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
      case '--content-concurrency':
        options.contentConcurrency = Math.max(1, Number(args[index + 1]) || DEFAULT_CONTENT_CONCURRENCY);
        index += 1;
        break;
      case '--output':
        options.outputDir = path.resolve(PROJECT_ROOT, args[index + 1] || options.target.outputDir);
        index += 1;
        break;
      case '--target':
        options.target = getTargetConfig(args[index + 1] || 'biquge');
        options.outputDir = options.target.outputDir;
        options.site = options.target.site;
        options.sourceApiHost = options.target.sourceApiHost;
        options.chapterApiHost = options.target.chapterApiHost;
        options.categories = ['index'];
        index += 1;
        break;
      case '--with-content':
        options.withContent = true;
        break;
      case '--force-content':
        options.withContent = true;
        options.skipExistingContent = false;
        break;
      case '--all-categories':
        options.allCategories = true;
        options.categories = [...options.target.categories];
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
笔趣阁批量导出工具

用法:
  node backend/biquge-export.js [--limit 100] [--output ./storage/json/biquge]

选项:
  --limit        抓取小说数量，默认 100
  --timeout      单次请求超时毫秒数，默认 15000
  --concurrency  并发数，默认 5
  --content-concurrency  正文抓取并发数，默认 8
  --output       输出目录，默认 ./storage/json/biquge
  --with-content 抓取并导出章节正文
  --force-content 强制重抓正文，忽略已存在的章节文件
  --all-categories 按全站分类入口抓取并去重
  --help         显示帮助

示例:
  node backend/biquge-export.js --limit 1
  node backend/biquge-export.js --limit 100 --concurrency 5
  node backend/biquge-export.js --with-content
  node backend/biquge-export.js --limit 1 --with-content
  node backend/biquge-export.js --all-categories --with-content
`);
}

async function fetchJson(target, url, timeoutMs) {
  const response = await requestBuffer(target, url, timeoutMs);
  return JSON.parse(response.body.toString('utf8'));
}

async function requestBuffer(target, url, timeoutMs, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error(`重定向过多: ${url}`);
  }

  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === 'http:' ? http : https;

  return new Promise((resolve, reject) => {
    const req = client.request(
      parsedUrl,
      {
        method: 'GET',
        rejectUnauthorized: !target.insecureHosts.has(parsedUrl.hostname),
        headers: buildRequestHeaders(target, url),
      },
      (res) => {
        const chunks = [];

        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          const redirectUrl = new URL(res.headers.location, parsedUrl).toString();
          res.resume();
          resolve(requestBuffer(target, redirectUrl, timeoutMs, redirectCount + 1));
          return;
        }

        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`请求失败: ${res.statusCode || 0}`));
            return;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body,
          });
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
  await fs.mkdir(path.join(outputDir, 'chapters'), { recursive: true });
}

async function downloadCover(bookId, outputDir, timeoutMs) {
  const targetPath = path.join(outputDir, 'covers', `${bookId}.jpg`);
  const currentTarget = outputDir.includes(`${path.sep}bige7`) ? getTargetConfig('bige7') : getTargetConfig('biquge');
  const coverUrl = buildCoverUrl(currentTarget, bookId);
  const headers = buildRequestHeaders(currentTarget, coverUrl);

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
      `accept: ${headers.accept}`,
      '-H',
      `accept-language: ${headers['accept-language']}`,
      '-H',
      `referer: ${headers.referer}`,
      '-o',
      targetPath,
    ],
    {
      maxBuffer: 1024 * 1024 * 10,
    }
  );

  return targetPath;
}

async function fetchLatestBooks(target, sourceApiHost, timeoutMs) {
  const payload = await fetchJson(target, `${sourceApiHost}/api/sort?sort=index`, timeoutMs);
  return Array.isArray(payload.data) ? payload.data : [];
}

async function fetchBooksByCategory(target, sourceApiHost, category, timeoutMs) {
  const payload = await fetchJson(target, `${sourceApiHost}/api/sort?sort=${encodeURIComponent(category)}`, timeoutMs);
  return Array.isArray(payload.data) ? payload.data : [];
}

function dedupeBooksById(books) {
  const seen = new Set();
  const result = [];

  for (const book of books) {
    const id = String(book.id);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(book);
  }

  return result;
}

async function fetchSelectedBooks(options) {
  if (!options.allCategories) {
    const latestBooks = await fetchLatestBooks(options.target, options.sourceApiHost, options.timeoutMs);
    return {
      source: `${options.sourceApiHost}/api/sort?sort=index`,
      categories: ['index'],
      books: latestBooks.slice(0, options.limit),
    };
  }

  const allBooks = [];
  for (const category of options.categories) {
    const books = await fetchBooksByCategory(options.target, options.sourceApiHost, category, options.timeoutMs);
    allBooks.push(...books);
  }

  const dedupedBooks = dedupeBooksById(allBooks);
  return {
    source: options.categories.map((category) => `${options.sourceApiHost}/api/sort?sort=${category}`),
    categories: [...options.categories],
    books: dedupedBooks,
  };
}

async function fetchBookDetail(target, sourceApiHost, bookId, timeoutMs) {
  return fetchJson(target, `${sourceApiHost}/api/book?id=${encodeURIComponent(bookId)}`, timeoutMs);
}

async function fetchBookChapterTitles(target, sourceApiHost, dirId, timeoutMs) {
  const payload = await fetchJson(target, `${sourceApiHost}/api/booklist?id=${encodeURIComponent(dirId)}`, timeoutMs);
  return Array.isArray(payload.list) ? payload.list : [];
}

async function fetchChapterContent(target, apiHost, bookId, chapterNumber, timeoutMs) {
  return fetchJson(
    target,
    `${apiHost}/api/chapter?id=${encodeURIComponent(bookId)}&chapterid=${encodeURIComponent(chapterNumber)}`,
    timeoutMs
  );
}

async function exportSingleBook(bookSummary, options) {
  const fetchedAt = new Date().toISOString();
  const bookId = Number(bookSummary.id);
  const detail = await fetchBookDetail(options.target, options.sourceApiHost, bookId, options.timeoutMs);
  const chapterTitles = await fetchBookChapterTitles(options.target, options.sourceApiHost, detail.dirid || bookId, options.timeoutMs);
  const coverPath = await downloadCover(bookId, options.outputDir, options.timeoutMs);
  const relativeCoverPath = toPosixRelativePath(coverPath);

  const payload = normalizeBookPayload({
    target: options.target,
    site: options.site,
    bookSummary,
    bookDetail: detail,
    chapterTitles,
    fetchedAt,
    coverLocalPath: relativeCoverPath,
  });

  const targetFile = path.join(options.outputDir, 'books', `${bookId}.json`);
  await fs.writeFile(targetFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  return {
    bookId: payload.bookId,
    title: payload.title,
    author: payload.author,
    category: payload.category,
    status: payload.status,
    lastUpdate: payload.lastUpdate,
    chapterCount: payload.chapterCount,
    coverLocalPath: relativeCoverPath,
    bookJsonPath: toPosixRelativePath(targetFile),
  };
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function exportChapterContentForBook(bookIndexEntry, options) {
  const bookJsonPath = path.join(PROJECT_ROOT, bookIndexEntry.bookJsonPath);
  const bookPayload = JSON.parse(await fs.readFile(bookJsonPath, 'utf8'));
  const chapterDir = path.join(options.outputDir, 'chapters', `${bookPayload.bookId}`);
  const errors = [];

  await fs.mkdir(chapterDir, { recursive: true });

  await runWithConcurrency(
    bookPayload.chapters,
    options.contentConcurrency,
    async (chapter) => {
      const targetPath = path.join(chapterDir, `${chapter.chapterNumber}.json`);

      if (options.skipExistingContent && await fileExists(targetPath)) {
        return;
      }

      try {
        const apiPayload = await fetchChapterContent(
          options.target,
          options.chapterApiHost,
          bookPayload.bookId,
          chapter.chapterNumber,
          options.timeoutMs
        );
        const chapterPayload = normalizeChapterPayload({
          target: options.target,
          site: options.site,
          apiHost: options.chapterApiHost,
          bookId: bookPayload.bookId,
          chapterNumber: chapter.chapterNumber,
          chapterApiPayload: apiPayload,
          pageUrls: [buildChapterApiUrl(options.target, bookPayload.bookId, chapter.chapterNumber)],
          bookTitle: bookPayload.title,
          author: bookPayload.author,
          fetchedAt: new Date().toISOString(),
        });
        await fs.writeFile(targetPath, `${JSON.stringify(chapterPayload, null, 2)}\n`, 'utf8');
      } catch (error) {
        errors.push({
          bookId: bookPayload.bookId,
          title: bookPayload.title,
          chapterNumber: chapter.chapterNumber,
          chapterTitle: chapter.title,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  );

  return {
    bookId: bookPayload.bookId,
    title: bookPayload.title,
    chapterCount: bookPayload.chapterCount,
    errorCount: errors.length,
    errors,
  };
}

function toPosixRelativePath(targetPath) {
  return path.relative(PROJECT_ROOT, targetPath).split(path.sep).join('/');
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => consume()
  );

  await Promise.all(workers);
  return results;
}

async function exportLatestBooks(options) {
  await ensureOutputDirs(options.outputDir);

  const selected = await fetchSelectedBooks(options);
  const selectedBooks = selected.books;
  const errors = [];

  const exportedBooks = await runWithConcurrency(
    selectedBooks,
    options.concurrency,
    async (bookSummary) => {
      try {
        return await exportSingleBook(bookSummary, options);
      } catch (error) {
        errors.push({
          bookId: Number(bookSummary.id),
          title: bookSummary.title || '',
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    }
  );

  const successBooks = exportedBooks.filter(Boolean);
  const indexPayload = {
    site: options.site,
    chapterApiHost: options.chapterApiHost,
    source: selected.source,
    categories: selected.categories,
    fetchedAt: new Date().toISOString(),
    requestedLimit: options.allCategories ? selectedBooks.length : options.limit,
    successCount: successBooks.length,
    errorCount: errors.length,
    books: successBooks,
  };

  await fs.writeFile(
    path.join(options.outputDir, 'index.json'),
    `${JSON.stringify(indexPayload, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(options.outputDir, 'errors.json'),
    `${JSON.stringify(errors, null, 2)}\n`,
    'utf8'
  );

  if (options.withContent) {
    const chapterResults = await runWithConcurrency(
      successBooks,
      options.concurrency,
      async (bookEntry) => exportChapterContentForBook(bookEntry, options)
    );
    const chapterErrors = chapterResults.flatMap((item) => item.errors);
    const chapterIndexPayload = {
      site: options.site,
      chapterApiHost: options.chapterApiHost,
      fetchedAt: new Date().toISOString(),
      bookCount: successBooks.length,
      chapterBookCount: chapterResults.length,
        chapterErrorCount: chapterErrors.length,
        books: chapterResults.map((item) => ({
          bookId: item.bookId,
          title: item.title,
          chapterCount: item.chapterCount,
          errorCount: item.errorCount,
          chapterDir: `${toPosixRelativePath(path.join(options.outputDir, 'chapters', `${item.bookId}`))}`,
        })),
    };

    await fs.writeFile(
      path.join(options.outputDir, 'chapter-index.json'),
      `${JSON.stringify(chapterIndexPayload, null, 2)}\n`,
      'utf8'
    );
    await fs.writeFile(
      path.join(options.outputDir, 'chapter-errors.json'),
      `${JSON.stringify(chapterErrors, null, 2)}\n`,
      'utf8'
    );
  }

  return indexPayload;
}

async function main() {
  const options = parseArgs(process.argv);
  const result = await exportLatestBooks(options);

  console.log('导出完成');
  console.log(`输出目录: ${toPosixRelativePath(options.outputDir)}`);
  console.log(`成功: ${result.successCount}`);
  console.log(`失败: ${result.errorCount}`);
}

module.exports = {
  buildCoverUrl,
  buildChapterUrl,
  buildChapterApiUrl,
  getTargetConfig,
  dedupeBooksById,
  normalizeBookPayload,
  normalizeChapterPayload,
  parseArgs,
  exportLatestBooks,
};

if (require.main === module) {
  main().catch((error) => {
    console.error('导出失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const { sanitizeChapterContent } = require('./chapter-cleaner');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ROOT = path.join(PROJECT_ROOT, 'storage/json/biquge');
const DEFAULT_SAMPLE_LIMIT = 20;
const DEFAULT_CONCURRENCY = 8;

function resolveRoot(rootPath = DEFAULT_ROOT) {
  return path.resolve(PROJECT_ROOT, rootPath);
}

function buildDefaultReportPath(root) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return path.join(root, 'reports', 'chapter-clean', `${stamp}.json`);
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const options = {
    root: DEFAULT_ROOT,
    book: null,
    startBook: null,
    endBook: null,
    limit: null,
    concurrency: DEFAULT_CONCURRENCY,
    write: false,
    report: null,
  };

  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];

    switch (current) {
      case '--root':
        options.root = resolveRoot(args[index + 1] || DEFAULT_ROOT);
        index += 1;
        break;
      case '--book':
        options.book = String(args[index + 1] || '').trim() || null;
        index += 1;
        break;
      case '--start-book':
        options.startBook = String(args[index + 1] || '').trim() || null;
        index += 1;
        break;
      case '--end-book':
        options.endBook = String(args[index + 1] || '').trim() || null;
        index += 1;
        break;
      case '--limit':
        options.limit = Math.max(1, Number(args[index + 1]) || 0) || null;
        index += 1;
        break;
      case '--concurrency':
        options.concurrency = Math.max(1, Number(args[index + 1]) || 0) || DEFAULT_CONCURRENCY;
        index += 1;
        break;
      case '--report':
        options.report = path.resolve(PROJECT_ROOT, args[index + 1] || '');
        index += 1;
        break;
      case '--write':
        options.write = true;
        break;
      case '--dry-run':
        options.write = false;
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
笔趣阁章节离线清洗工具

用法:
  node backend/clean-biquge-chapters.js [--root ./storage/json/biquge] [--book 2530] [--start-book 1000 --end-book 1999] [--limit 50] [--concurrency 8] [--dry-run|--write] [--report ./report.json]

选项:
  --root    章节根目录，默认 ./storage/json/biquge
  --book    仅清洗指定 bookId
  --start-book 仅清洗大于等于该 bookId 的书
  --end-book   仅清洗小于等于该 bookId 的书
  --limit   最多处理多少章
  --concurrency 并发处理章节数，默认 8
  --dry-run 只扫描和生成报告（默认）
  --write   真正写回源文件
  --report  指定报告文件路径
  --help    显示帮助
`);
}

async function listBookDirectories(root, targetBookId = null) {
  const chaptersRoot = path.join(root, 'chapters');
  const entries = await fs.readdir(chaptersRoot, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (!targetBookId) {
    return dirs;
  }

  return dirs.filter((dir) => dir === targetBookId);
}

function applyBookRange(bookDirs, options = {}) {
  if (options.book) {
    return bookDirs;
  }

  return bookDirs.filter((bookId) => {
    if (options.startBook && bookId.localeCompare(options.startBook, 'en') < 0) {
      return false;
    }
    if (options.endBook && bookId.localeCompare(options.endBook, 'en') > 0) {
      return false;
    }
    return true;
  });
}

async function listChapterEntriesForBook(root, bookId) {
  const chapterDir = path.join(root, 'chapters', bookId);
  const entries = await fs.readdir(chapterDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => ({
      bookId,
      chapterNumber: Number.parseInt(path.basename(entry.name, '.json'), 10),
      filePath: path.join(chapterDir, entry.name),
    }))
    .filter((entry) => Number.isInteger(entry.chapterNumber) && entry.chapterNumber > 0)
    .sort((left, right) => left.chapterNumber - right.chapterNumber);
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = [...items];
  const size = Math.max(1, concurrency || 1);

  async function consume() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        return;
      }
      await worker(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(size, items.length || 1) }, () => consume()));
}

function summarizeSnippet(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

async function processChapterFile(entry, options) {
  const raw = await fs.readFile(entry.filePath, 'utf8');
  const payload = JSON.parse(raw);
  const originalContent = typeof payload.content === 'string' ? payload.content : '';
  const cleanedContent = sanitizeChapterContent(originalContent);
  const changed = cleanedContent !== originalContent;

  if (changed && options.write) {
    payload.content = cleanedContent;
    await fs.writeFile(entry.filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  return {
    ...entry,
    changed,
    written: changed && options.write,
    beforeLength: originalContent.length,
    afterLength: cleanedContent.length,
    beforeSnippet: summarizeSnippet(originalContent),
    afterSnippet: summarizeSnippet(cleanedContent),
  };
}

async function writeReport(reportPath, result) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

async function cleanBiqugeChapters(options = {}) {
  const root = resolveRoot(options.root || DEFAULT_ROOT);
  const reportPath = options.report
    ? path.resolve(PROJECT_ROOT, options.report)
    : buildDefaultReportPath(root);
  const allBookDirs = await listBookDirectories(root, options.book);
  const bookDirs = applyBookRange(allBookDirs, options);
  const summary = {
    books: bookDirs.length,
    scanned: 0,
    changed: 0,
    written: 0,
    unchanged: 0,
    failed: 0,
  };
  const changes = [];
  const failures = [];

  let remaining = options.limit || Infinity;

  for (const bookId of bookDirs) {
    if (remaining <= 0) {
      break;
    }

    const chapterEntries = await listChapterEntriesForBook(root, bookId);
    const slice = Number.isFinite(remaining) ? chapterEntries.slice(0, remaining) : chapterEntries;

    await runWithConcurrency(slice, options.concurrency || DEFAULT_CONCURRENCY, async (entry) => {
      summary.scanned += 1;

      try {
        const result = await processChapterFile(entry, options);

        if (result.changed) {
          summary.changed += 1;
          if (result.written) {
            summary.written += 1;
          }
          if (changes.length < DEFAULT_SAMPLE_LIMIT) {
            changes.push(result);
          }
        } else {
          summary.unchanged += 1;
        }
      } catch (error) {
        summary.failed += 1;
        failures.push({
          bookId: entry.bookId,
          chapterNumber: entry.chapterNumber,
          filePath: entry.filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    remaining -= slice.length;
  }

  const report = {
    root,
    mode: options.write ? 'write' : 'dry-run',
    summary,
    changes,
    failures,
  };

  await writeReport(reportPath, report);

  return {
    ...report,
    reportPath,
  };
}

function printResult(result) {
  console.log(result.mode === 'write' ? '清洗完成（已写回）' : '清洗完成（dry-run）');
  console.log(`扫描章节数: ${result.summary.scanned}`);
  console.log(`命中变更数: ${result.summary.changed}`);
  console.log(`实际写回数: ${result.summary.written}`);
  console.log(`未变化数: ${result.summary.unchanged}`);
  console.log(`失败数: ${result.summary.failed}`);
  console.log(`报告路径: ${result.reportPath}`);

  if (result.changes.length > 0) {
    console.log('变更示例:');
    for (const change of result.changes.slice(0, 5)) {
      console.log(`- ${change.bookId}/${change.chapterNumber} | ${change.beforeLength} -> ${change.afterLength} | ${change.beforeSnippet} => ${change.afterSnippet}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv);
  const result = await cleanBiqugeChapters(options);
  printResult(result);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_ROOT,
  parseArgs,
  resolveRoot,
  buildDefaultReportPath,
  listBookDirectories,
  applyBookRange,
  listChapterEntriesForBook,
  runWithConcurrency,
  cleanBiqugeChapters,
  printResult,
};

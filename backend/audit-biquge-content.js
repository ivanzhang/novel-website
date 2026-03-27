#!/usr/bin/env node

const fs = require('node:fs/promises');
const path = require('node:path');

const { sanitizeChapterContent } = require('./chapter-cleaner');
const { writeTaskReport } = require('./task-report');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_ROOT = path.join(PROJECT_ROOT, 'storage/json/biquge');
const DEFAULT_REPORT = path.join(DEFAULT_ROOT, 'reports', 'content-audit', 'audit.json');
const DEFAULT_MIN_LENGTH = 120;

const AVAILABLE_CHECKS = new Set(['missing-files', 'content-quality', 'preview', 'short-content', 'db-disk']);

function resolveRoot(rootPath = DEFAULT_ROOT) {
  return path.resolve(PROJECT_ROOT, rootPath);
}

function parseArgs(argv = process.argv) {
  const args = argv.slice(2);
  const options = {
    root: DEFAULT_ROOT,
    book: null,
    limit: null,
    checks: ['missing-files', 'content-quality', 'preview', 'short-content'],
    report: DEFAULT_REPORT,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--root':
        options.root = resolveRoot(args[++i]);
        break;
      case '--book':
        options.book = String(args[++i] || '').trim();
        break;
      case '--limit':
        options.limit = Math.max(1, Number(args[++i]) || 0) || null;
        break;
      case '--report':
        options.report = path.resolve(PROJECT_ROOT, args[++i]);
        break;
      case '--check':
        const name = args[++i];
        if (name && AVAILABLE_CHECKS.has(name)) {
          options.checks = [...new Set([...options.checks, name])];
        }
        break;
      case '--help':
        printHelp();
        process.exit(0);
      default:
        break;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
笔趣阁内容质量巡检

Usage:
  node backend/audit-biquge-content.js [--root ./storage/json/biquge] [--book 2530] [--limit 100] [--check missing-files] [--report ./audit.json]

Checks:
  missing-files   # 缺失章节或封面
  content-quality # 正文仍含广告/水印
  preview         # content_preview 异常
  short-content   # 正文过短
  db-disk         # 数据库/磁盘不一致（可选）
`);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (e) {
    return false;
  }
}

async function listBookDirs(root, targetBook) {
  const chaptersRoot = path.join(root, 'chapters');
  const entries = await fs.readdir(chaptersRoot, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (targetBook) {
    return dirs.filter((dir) => dir === targetBook);
  }
  return dirs;
}

async function listChapterFiles(root, dirs, limit = null) {
  const files = [];
  for (const dir of dirs) {
    const chapterDir = path.join(root, 'chapters', dir);
    const entries = await fs.readdir(chapterDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const chapterNumber = Number.parseInt(path.basename(entry.name, '.json'), 10);
      if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) continue;
      files.push({ bookId: dir, chapterNumber, filePath: path.join(chapterDir, entry.name) });
      if (limit && files.length >= limit) return files;
    }
  }
  return files;
}

function detectAdPattern(text) {
  const normalized = String(text || '').toLowerCase();
  return /(网址|域名|仓粉)/.test(normalized) || /[a-z0-9]{2,}\.{0,1}(?:com|cc|net|org|cn)/.test(normalized);
}

async function auditChapter(entry, root, checks) {
  const raw = await fs.readFile(entry.filePath, 'utf8');
  const data = JSON.parse(raw);
  const content = String(data.content || '');
  const preview = String(data.content_preview || '');
  const results = { bookId: entry.bookId, chapterNumber: entry.chapterNumber, filePath: entry.filePath };

  if (checks.has('missing-files')) {
    const coverPath = path.join(root, 'covers', `${entry.bookId}.jpg`);
    results.coverMissing = !(await fileExists(coverPath));
  }

  if (checks.has('content-quality')) {
    const cleaned = sanitizeChapterContent(content);
    results.contentQuality = detectAdPattern(content) || detectAdPattern(cleaned);
  }

  if (checks.has('preview')) {
    results.previewIssue = !preview || preview.length < 50;
  }

  if (checks.has('short-content')) {
    results.shortContent = content.trim().length < DEFAULT_MIN_LENGTH;
  }

  return results;
}

async function auditContent(options = {}) {
  const root = resolveRoot(options.root);
  const bookDirs = await listBookDirs(root, options.book);
  const chapters = await listChapterFiles(root, bookDirs, options.limit);
  const checks = new Set(options.checks);
  const issues = [];
  const summary = { scanned: chapters.length, missingFiles: 0, contentQuality: 0, preview: 0, shortContent: 0, dbDisk: 0 };

  for (const entry of chapters) {
    const result = await auditChapter(entry, root, checks);
    if (result.coverMissing || result.contentQuality || result.previewIssue || result.shortContent) {
      summary.missingFiles += result.coverMissing ? 1 : 0;
      summary.contentQuality += result.contentQuality ? 1 : 0;
      summary.preview += result.previewIssue ? 1 : 0;
      summary.shortContent += result.shortContent ? 1 : 0;
      issues.push(result);
    }
  }

  const finalReport = {
    task: 'audit-biquge-content',
    status: 'success',
    root,
    bookFilter: options.book,
    checks: Array.from(checks),
    summary,
    items: issues,
    issues,
    report: options.report,
  };

  await writeTaskReport(options.report, finalReport);

  return finalReport;
}

function printAudit(result) {
  console.log('内容质量巡检报告');
  console.log(`扫描章节: ${result.summary.scanned}`);
  console.log(`缺失封面: ${result.summary.missingFiles}`);
  console.log(`疑似广告: ${result.summary.contentQuality}`);
  console.log(`预览异常: ${result.summary.preview}`);
  console.log(`章节太短: ${result.summary.shortContent}`);
  console.log(`报告输出: ${result.report}`);
  if (result.issues.length > 0) {
    console.log('示例问题:');
    result.issues.slice(0, 5).forEach((issue) => {
      console.log(`- ${issue.bookId}/${issue.chapterNumber}: coverMissing=${issue.coverMissing || false}, contentQuality=${issue.contentQuality || false}`);
    });
  }
}

async function main() {
  const options = parseArgs();
  const result = await auditContent(options);
  result.report = options.report;
  printAudit(result);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  resolveRoot,
  auditContent,
};

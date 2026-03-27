const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function loadCleanerScript() {
  const scriptPath = path.resolve(__dirname, '../clean-biquge-chapters.js');
  delete require.cache[scriptPath];
  return require('../clean-biquge-chapters');
}

async function createTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clean-biquge-chapters-'));
  await fs.mkdir(path.join(root, 'chapters', '1001'), { recursive: true });
  await fs.mkdir(path.join(root, 'chapters', '1002'), { recursive: true });

  await fs.writeFile(
    path.join(root, 'chapters', '1001', '1.json'),
    JSON.stringify({
      bookId: 1001,
      chapterNumber: 1,
      title: '第一章',
      content: '第一段正文。\n请收藏本站最新网址 b i q u g e 。 c o m，继续阅读更方便。\n第二段正文。'
    }, null, 2)
  );

  await fs.writeFile(
    path.join(root, 'chapters', '1001', '2.json'),
    JSON.stringify({
      bookId: 1001,
      chapterNumber: 2,
      title: '第二章',
      content: '这里没有广告，只有正常正文。'
    }, null, 2)
  );

  await fs.writeFile(
    path.join(root, 'chapters', '1002', '1.json'),
    JSON.stringify({
      bookId: 1002,
      chapterNumber: 1,
      title: '另一章',
      content: '他刚推门而入，请记住最新域名 x-y-z·c c，眼前忽然一亮。'
    }, null, 2)
  );

  return root;
}

test('parseArgs 应支持 root、book、区间、limit、dry-run、write 和 report', () => {
  const { parseArgs } = loadCleanerScript();
  const result = parseArgs([
    'node',
    'backend/clean-biquge-chapters.js',
    '--root',
    '/tmp/biquge',
    '--book',
    '1001',
    '--start-book',
    '1000',
    '--end-book',
    '1999',
    '--limit',
    '3',
    '--write',
    '--report',
    '/tmp/report.json',
  ]);

  assert.equal(result.root, '/tmp/biquge');
  assert.equal(result.book, '1001');
  assert.equal(result.startBook, '1000');
  assert.equal(result.endBook, '1999');
  assert.equal(result.limit, 3);
  assert.equal(result.write, true);
  assert.equal(result.report, '/tmp/report.json');
});

test('cleanBiqugeChapters dry-run 应报告变更但不改写文件', async () => {
  const root = await createTempRoot();

  try {
    const { cleanBiqugeChapters } = loadCleanerScript();
    const chapterFile = path.join(root, 'chapters', '1001', '1.json');
    const original = await fs.readFile(chapterFile, 'utf8');

    const result = await cleanBiqugeChapters({
      root,
      report: path.join(root, 'report.json'),
    });

    const after = await fs.readFile(chapterFile, 'utf8');

    assert.equal(result.summary.scanned, 3);
    assert.equal(result.summary.changed, 2);
    assert.equal(result.summary.written, 0);
    assert.equal(result.summary.unchanged, 1);
    assert.equal(result.summary.failed, 0);
    assert.equal(result.changes.length, 2);
    assert.equal(after, original);

    const report = JSON.parse(await fs.readFile(path.join(root, 'report.json'), 'utf8'));
    assert.equal(report.summary.changed, 2);
    assert.equal(report.summary.written, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cleanBiqugeChapters 应支持按 book 过滤和 limit 限制', async () => {
  const root = await createTempRoot();

  try {
    const { cleanBiqugeChapters } = loadCleanerScript();
    const result = await cleanBiqugeChapters({
      root,
      book: '1001',
      limit: 1,
      report: path.join(root, 'report.json'),
    });

    assert.equal(result.summary.scanned, 1);
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].bookId, '1001');
    assert.equal(result.changes[0].chapterNumber, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cleanBiqugeChapters 应支持按书号区间分批清洗', async () => {
  const root = await createTempRoot();

  try {
    const { cleanBiqugeChapters } = loadCleanerScript();
    const result = await cleanBiqugeChapters({
      root,
      startBook: '1002',
      endBook: '1002',
      report: path.join(root, 'report.json'),
    });

    assert.equal(result.summary.scanned, 1);
    assert.equal(result.summary.changed, 1);
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0].bookId, '1002');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cleanBiqugeChapters --write 应改写命中文件', async () => {
  const root = await createTempRoot();

  try {
    const { cleanBiqugeChapters } = loadCleanerScript();
    const chapterFile = path.join(root, 'chapters', '1002', '1.json');

    const result = await cleanBiqugeChapters({
      root,
      book: '1002',
      write: true,
      report: path.join(root, 'report.json'),
    });

    const updated = JSON.parse(await fs.readFile(chapterFile, 'utf8'));

    assert.equal(result.summary.scanned, 1);
    assert.equal(result.summary.changed, 1);
    assert.equal(result.summary.written, 1);
    assert.equal(updated.content, '他刚推门而入，眼前忽然一亮。');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('cleanBiqugeChapters 应写出统一任务报告字段', async () => {
  const root = await createTempRoot();

  try {
    const { cleanBiqugeChapters } = loadCleanerScript();
    const reportPath = path.join(root, 'reports', 'chapter-clean', 'clean.json');
    const result = await cleanBiqugeChapters({
      root,
      write: true,
      report: reportPath,
    });

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));

    assert.equal(result.reportPath, reportPath);
    assert.equal(report.task, 'clean-biquge-chapters');
    assert.equal(report.status, 'success');
    assert.equal(report.mode, 'write');
    assert.ok(Array.isArray(report.items));
    assert.equal(report.items.length, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

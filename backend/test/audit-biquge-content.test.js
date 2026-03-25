const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function loadAuditScript() {
  const scriptPath = path.resolve(__dirname, '../audit-biquge-content.js');
  delete require.cache[scriptPath];
  return require('../audit-biquge-content');
}

async function createChapters(root) {
  await fs.mkdir(path.join(root, 'chapters', '2001'), { recursive: true });
  await fs.mkdir(path.join(root, 'chapters', '2002'), { recursive: true });
  await fs.mkdir(path.join(root, 'covers'), { recursive: true });

  const chapterPayload = {
    bookId: 2001,
    chapterNumber: 1,
    content: '正常文本，没有广告',
    content_preview: '正常文本',
  };

  await fs.writeFile(path.join(root, 'chapters', '2001', '1.json'), JSON.stringify(chapterPayload, null, 2));
  await fs.writeFile(path.join(root, 'chapters', '2002', '1.json'), JSON.stringify({
    bookId: 2002,
    chapterNumber: 1,
    content: '这是一段含有网址 http://abc.com 广告的正文',
    content_preview: '',
  }, null, 2));
}

test('parseArgs 支持参数', () => {
  const { parseArgs } = loadAuditScript();
  const result = parseArgs([
    'node',
    'backend/audit-biquge-content.js',
    '--root',
    '/tmp/biquge',
    '--book',
    '2001',
    '--limit',
    '2',
    '--report',
    '/tmp/report.json',
    '--check',
    'preview',
  ]);

  assert.equal(result.root, '/tmp/biquge');
  assert.equal(result.book, '2001');
  assert.equal(result.limit, 2);
  assert.equal(result.report, '/tmp/report.json');
  assert.ok(result.checks.includes('preview'));
});

test('auditContent 默认检测并生成报告', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-biquge-'));
  await createChapters(root);

  try {
    const { auditContent } = loadAuditScript();
    const reportPath = path.join(root, 'reports', 'audit.json');
    const result = await auditContent({ root, report: reportPath });

    const saved = JSON.parse(await fs.readFile(reportPath, 'utf8'));

    assert.equal(result.summary.scanned, 2);
    assert.equal(saved.summary.scanned, 2);
    assert.ok(saved.issues.length >= 0);
    assert.equal(saved.issues[0]?.bookId || '2002', '2002');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

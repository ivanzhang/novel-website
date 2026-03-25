const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  buildRetryDelayMs,
  chunkFiles,
  normalizeUploadResults,
  pickPendingFiles,
  writeTaskReport,
} = require('../upload-telegraph-batch');

test('chunkFiles 按 10 个一组切分文件', () => {
  const files = Array.from({ length: 23 }, (_, index) => `f-${index + 1}.jpg`);

  const groups = chunkFiles(files, 10);

  assert.equal(groups.length, 3);
  assert.equal(groups[0].length, 10);
  assert.equal(groups[1].length, 10);
  assert.equal(groups[2].length, 3);
});

test('normalizeUploadResults 用返回结果建立文件名到 URL 的映射', () => {
  const files = [
    { name: '557.jpg' },
    { name: '713.jpg' },
  ];
  const results = [
    { src: 'https://aixs.us.ci/file/a.jpg', fileName: '557.jpg' },
    { src: 'https://aixs.us.ci/file/b.jpg', fileName: '713.jpg' },
  ];

  const map = normalizeUploadResults(files, results);

  assert.deepEqual(map, {
    '557.jpg': 'https://aixs.us.ci/file/a.jpg',
    '713.jpg': 'https://aixs.us.ci/file/b.jpg',
  });
});

test('pickPendingFiles 跳过已有映射的文件', () => {
  const files = [
    { name: '557.jpg' },
    { name: '713.jpg' },
    { name: '9479.jpg' },
  ];
  const existingMap = {
    '713.jpg': 'https://aixs.us.ci/file/b.jpg',
  };

  const pending = pickPendingFiles(files, existingMap);

  assert.deepEqual(
    pending.map((item) => item.name),
    ['557.jpg', '9479.jpg']
  );
});

test('buildRetryDelayMs 解析 retry after 秒数为毫秒', () => {
  const delayMs = buildRetryDelayMs(new Error('Too Many Requests: retry after 29'));

  assert.equal(delayMs, 29000);
});

test('writeTaskReport 应写出统一任务报告格式', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upload-telegraph-report-'));
  const reportPath = path.join(root, 'reports', 'import-jobs', 'upload-telegraph-batch.json');

  try {
    await writeTaskReport(reportPath, {
      task: 'upload-telegraph-batch',
      status: 'success',
      summary: { uploaded: 2, failedGroups: 0 },
      items: [{ file: '1001.jpg', status: 'uploaded' }],
    });

    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.task, 'upload-telegraph-batch');
    assert.equal(report.status, 'success');
    assert.equal(report.summary.uploaded, 2);
    assert.equal(report.items.length, 1);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

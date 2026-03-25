const fs = require('node:fs/promises');
const path = require('node:path');

function buildTimestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
}

function buildDefaultTaskReportPath(root, taskName) {
  return path.join(root, 'reports', 'import-jobs', `${buildTimestamp()}-${taskName}.json`);
}

async function writeTaskReport(reportPath, payload) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

module.exports = {
  buildDefaultTaskReportPath,
  writeTaskReport,
};

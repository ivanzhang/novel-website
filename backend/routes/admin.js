const express = require('express');
const fs = require('node:fs/promises');
const path = require('node:path');

const router = express.Router();

const DEFAULT_ROOT = path.resolve(__dirname, '../../storage/json/biquge');

function getBiqugeRoot() {
  return path.resolve(process.env.BIQUGE_JSON_ROOT || DEFAULT_ROOT);
}

async function listJsonReports(reportDir) {
  try {
    const entries = await fs.readdir(reportDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));

    if (files.length === 0) {
      return [];
    }

    const withStats = await Promise.all(files.map(async (entry) => ({
      name: entry.name,
      filePath: path.join(reportDir, entry.name),
      stat: await fs.stat(path.join(reportDir, entry.name)),
    })));

    return withStats.sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs || right.name.localeCompare(left.name, 'en'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function readLatestReport(reportDir, sampleField) {
  const files = await listJsonReports(reportDir);

  if (files.length === 0) {
    return {
      latest: null,
      total_reports: 0,
    };
  }

  const latest = files[0];
  const raw = await fs.readFile(latest.filePath, 'utf8');
  const parsed = JSON.parse(raw);
  const samples = Array.isArray(parsed[sampleField]) ? parsed[sampleField].slice(0, 10) : [];

  return {
    latest: {
      filename: latest.name,
      updated_at: latest.stat.mtime.toISOString(),
      mode: parsed.mode || null,
      checks: parsed.checks || null,
      summary: parsed.summary || {},
      samples,
    },
    total_reports: files.length,
  };
}

async function readLatestTaskReports(reportDir) {
  const files = await listJsonReports(reportDir);

  if (files.length === 0) {
    return {
      latest: [],
      total_reports: 0,
    };
  }

  const latest = [];

  for (const file of files.slice(0, 8)) {
    const raw = await fs.readFile(file.filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const sampleSource = Array.isArray(parsed.items)
      ? parsed.items
      : Array.isArray(parsed.changes)
        ? parsed.changes
        : Array.isArray(parsed.issues)
          ? parsed.issues
          : [];

    latest.push({
      filename: file.name,
      updated_at: file.stat.mtime.toISOString(),
      task: parsed.task || file.name.replace(/\.json$/i, ''),
      status: parsed.status || parsed.mode || 'success',
      summary: parsed.summary || {},
      samples: sampleSource.slice(0, 5),
    });
  }

  return {
    latest,
    total_reports: files.length,
  };
}

router.get('/admin/content-quality', async (req, res, next) => {
  const root = getBiqugeRoot();

  try {
    const [clean, audit, tasks] = await Promise.all([
      readLatestReport(path.join(root, 'reports', 'chapter-clean'), 'changes'),
      readLatestReport(path.join(root, 'reports', 'content-audit'), 'issues'),
      readLatestTaskReports(path.join(root, 'reports', 'import-jobs')),
    ]);

    res.json({
      root,
      clean,
      audit,
      tasks,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

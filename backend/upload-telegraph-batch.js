#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { buildDefaultTaskReportPath, writeTaskReport } = require('./task-report');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function resolveProjectPath(targetPath) {
  return path.resolve(PROJECT_ROOT, targetPath);
}

function chunkFiles(files, size = 10) {
  const result = [];

  for (let index = 0; index < files.length; index += size) {
    result.push(files.slice(index, index + size));
  }

  return result;
}

function pickPendingFiles(files, existingMap = {}) {
  return files.filter((file) => !existingMap[file.name]);
}

function normalizeUploadResults(files, results) {
  const resultMap = {};

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const item = results[index] || {};
    const fileName = item.fileName || file.name;
    const src = item.src;

    if (!fileName || !src) {
      continue;
    }

    resultMap[fileName] = src;
  }

  return resultMap;
}

function buildRetryDelayMs(error) {
  const message = error && error.message ? String(error.message) : '';
  const match = message.match(/retry after\s+(\d+)/i);

  if (!match) {
    return 0;
  }

  return Number.parseInt(match[1], 10) * 1000;
}

function absolutizeSrc(src, endpoint) {
  if (!src) {
    return src;
  }

  if (/^https?:\/\//.test(src)) {
    return src;
  }

  const baseUrl = new URL(endpoint);
  return new URL(src, `${baseUrl.origin}/`).toString();
}

async function scanFiles(dirPath) {
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}

async function saveMap(filePath, payload) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const options = {
    root: 'storage/json/biquge',
    endpoint: '',
    mapFile: '',
    report: '',
    limit: Infinity,
    batchSize: 10,
    batchRateMs: 2000,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--root') {
      options.root = argv[index + 1];
      index += 1;
    } else if (arg === '--endpoint') {
      options.endpoint = argv[index + 1];
      index += 1;
    } else if (arg === '--map-file') {
      options.mapFile = argv[index + 1];
      index += 1;
    } else if (arg === '--report') {
      options.report = argv[index + 1];
      index += 1;
    } else if (arg === '--limit') {
      options.limit = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--batch-size') {
      options.batchSize = Number(argv[index + 1]);
      index += 1;
    } else if (arg === '--batch-rate-ms') {
      options.batchRateMs = Number(argv[index + 1]);
      index += 1;
    }
  }

  return options;
}

async function uploadBatchFiles(options = {}) {
  const root = resolveProjectPath(options.root || 'storage/json/biquge');
  const coversDir = path.join(root, 'covers');
  const mapFile = resolveProjectPath(options.mapFile || path.join(options.root || 'storage/json/biquge', 'cover-cdn-map.json'));
  const files = await scanFiles(coversDir);
  const existingMap = await readJsonIfExists(mapFile);
  const limitedFiles = pickPendingFiles(files, existingMap).slice(0, Number.isFinite(options.limit) ? options.limit : undefined);
  const groups = chunkFiles(limitedFiles, options.batchSize || 10);

  return {
    root,
    coversDir,
    mapFile,
    groups,
    existingMap,
  };
}

async function uploadGroup(files, endpoint) {
  const formData = new FormData();

  for (const file of files) {
    const buffer = await fsp.readFile(file.path);
    const blob = new Blob([buffer], { type: inferMimeType(file.name) });
    formData.append('file', blob, file.name);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json();

  if (!response.ok) {
    const message = payload && payload.error ? payload.error : `Upload failed with status ${response.status}`;
    throw new Error(message);
  }

  if (!Array.isArray(payload)) {
    throw new Error('Upload response is not an array');
  }

  return payload.map((item) => ({
    ...item,
    src: absolutizeSrc(item.src, endpoint),
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferMimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.gif') {
    return 'image/gif';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  if (extension === '.mp4') {
    return 'video/mp4';
  }

  if (extension === '.json') {
    return 'application/json';
  }

  return 'application/octet-stream';
}

async function main() {
  const options = parseArgs(process.argv);
  const state = await uploadBatchFiles(options);
  const reportPath = resolveProjectPath(options.report || path.join(options.root || 'storage/json/biquge', 'reports', 'import-jobs', `${path.basename(buildDefaultTaskReportPath('.', 'upload-telegraph-batch'))}`));

  console.log('批量上传脚本已就绪');
  console.log(`待上传文件组数: ${state.groups.length}`);
  console.log(`映射文件: ${state.mapFile}`);

  if (!options.endpoint) {
    await writeTaskReport(reportPath, {
      task: 'upload-telegraph-batch',
      status: 'planned',
      summary: {
        pendingGroups: state.groups.length,
        pendingFiles: state.groups.reduce((sum, group) => sum + group.length, 0),
      },
      items: state.groups.slice(0, 5).flat().map((file) => ({ file: file.name, status: 'pending' })),
    });
    console.log('未提供 --endpoint，本次仅输出待处理分组信息。');
    return;
  }

  const mergedMap = { ...state.existingMap };
  const stats = {
    uploaded: 0,
    failedGroups: 0,
    retriedGroups: 0,
  };
  const items = [];
  const baseThrottleMs = Math.max(0, Number.isFinite(options.batchRateMs) ? options.batchRateMs : 0);
  let dynamicThrottleMs = baseThrottleMs;

  for (const group of state.groups) {
    await sleep(dynamicThrottleMs);
    try {
      let results;

      try {
        results = await uploadGroup(group, options.endpoint);
      } catch (error) {
        const retryDelayMs = buildRetryDelayMs(error);

        if (retryDelayMs > 0) {
          stats.retriedGroups += 1;
          console.log(`命中限流，等待 ${Math.ceil(retryDelayMs / 1000)} 秒后重试当前分组`);
          await sleep(retryDelayMs);
          dynamicThrottleMs = Math.min(dynamicThrottleMs + 2000, 60000);
          results = await uploadGroup(group, options.endpoint);
        } else {
          throw error;
        }
      }

      Object.assign(mergedMap, normalizeUploadResults(group, results));
      stats.uploaded += group.length;
      items.push(...group.map((file) => ({ file: file.name, status: 'uploaded' })));
      await saveMap(state.mapFile, mergedMap);
      dynamicThrottleMs = Math.max(baseThrottleMs, dynamicThrottleMs - 500);
    } catch (error) {
      stats.failedGroups += 1;
      items.push(...group.map((file) => ({ file: file.name, status: 'failed', error: error.message })));
      console.error(`上传分组失败: ${group.map((item) => item.name).join(', ')}`);
      console.error(error.stack || error.message);
    }
  }

  await writeTaskReport(reportPath, {
    task: 'upload-telegraph-batch',
    status: stats.failedGroups > 0 ? 'partial' : 'success',
    summary: {
      uploaded: stats.uploaded,
      failedGroups: stats.failedGroups,
      retriedGroups: stats.retriedGroups,
      totalFiles: state.groups.reduce((sum, group) => sum + group.length, 0),
    },
    items: items.slice(0, 200),
  });

  console.log(`成功上传文件数: ${stats.uploaded}`);
  console.log(`失败分组数: ${stats.failedGroups}`);
  console.log(`限流重试分组数: ${stats.retriedGroups}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  absolutizeSrc,
  buildRetryDelayMs,
  chunkFiles,
  inferMimeType,
  normalizeUploadResults,
  parseArgs,
  pickPendingFiles,
  readJsonIfExists,
  saveMap,
  scanFiles,
  uploadGroup,
  uploadBatchFiles,
  writeTaskReport,
};

/*
用法示例：

node backend/upload-telegraph-batch.js \
  --root storage/json/biquge \
  --endpoint https://aixs.us.ci/upload
*/

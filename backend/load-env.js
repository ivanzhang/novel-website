const fs = require('node:fs');
const path = require('node:path');

function stripWrappingQuotes(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];

    if ((first === '"' && last === '"') || (first === '\'' && last === '\'')) {
      return value.slice(1, -1);
    }
  }

  return value;
}

function parseEnvContent(content = '') {
  const result = {};
  const lines = String(content).split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(normalized.slice(separatorIndex + 1).trim());

    if (!key) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function loadEnvFiles(options = {}) {
  const dir = options.dir || __dirname;
  const env = options.env || process.env;
  const files = Array.isArray(options.files) && options.files.length > 0
    ? options.files
    : ['.env', '.env.local'];
  const loaded = {};

  for (const fileName of files) {
    const filePath = path.join(dir, fileName);

    if (!fs.existsSync(filePath)) {
      continue;
    }

    const entries = parseEnvContent(fs.readFileSync(filePath, 'utf8'));
    Object.assign(loaded, entries);
  }

  for (const [key, value] of Object.entries(loaded)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }

  return {
    dir,
    files,
    loaded,
  };
}

function loadBackendEnv() {
  // 本地开发统一从 backend 目录读取 .env，避免每次手动传 JWT_SECRET。
  return loadEnvFiles({
    dir: __dirname,
    env: process.env,
    files: ['.env', '.env.local'],
  });
}

module.exports = {
  parseEnvContent,
  loadEnvFiles,
  loadBackendEnv,
};

/*
用法示例：

const { loadBackendEnv } = require('./load-env');
loadBackendEnv();
console.log(process.env.JWT_SECRET);
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseEnvContent, loadEnvFiles } = require('../load-env');

test('parseEnvContent 应忽略注释并解析带引号的值', () => {
  const result = parseEnvContent(`
# 注释行
JWT_SECRET=test-secret
PORT="8081"
EMPTY=
  CORS_ORIGIN='http://localhost:8080'
`);

  assert.deepEqual(result, {
    JWT_SECRET: 'test-secret',
    PORT: '8081',
    EMPTY: '',
    CORS_ORIGIN: 'http://localhost:8080',
  });
});

test('loadEnvFiles 应从 .env 载入缺失的环境变量', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-env-'));
  const env = {};

  try {
    fs.writeFileSync(path.join(tempDir, '.env'), 'JWT_SECRET=test-secret\nPORT=8081\n', 'utf8');

    const result = loadEnvFiles({
      dir: tempDir,
      env,
      files: ['.env'],
    });

    assert.equal(env.JWT_SECRET, 'test-secret');
    assert.equal(env.PORT, '8081');
    assert.deepEqual(result.loaded, {
      JWT_SECRET: 'test-secret',
      PORT: '8081',
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('.env.local 应覆盖 .env 中的同名配置', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-env-'));
  const env = {};

  try {
    fs.writeFileSync(path.join(tempDir, '.env'), 'JWT_SECRET=from-env\nPORT=8081\n', 'utf8');
    fs.writeFileSync(path.join(tempDir, '.env.local'), 'JWT_SECRET=from-local\n', 'utf8');

    loadEnvFiles({
      dir: tempDir,
      env,
      files: ['.env', '.env.local'],
    });

    assert.equal(env.JWT_SECRET, 'from-local');
    assert.equal(env.PORT, '8081');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('已有的环境变量优先级高于 .env 文件', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-env-'));
  const env = {
    JWT_SECRET: 'from-process',
  };

  try {
    fs.writeFileSync(path.join(tempDir, '.env'), 'JWT_SECRET=from-env\nPORT=8081\n', 'utf8');

    loadEnvFiles({
      dir: tempDir,
      env,
      files: ['.env'],
    });

    assert.equal(env.JWT_SECRET, 'from-process');
    assert.equal(env.PORT, '8081');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

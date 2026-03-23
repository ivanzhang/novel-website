const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function clearModules() {
  for (const relativePath of [
    '../seed.js',
  ]) {
    delete require.cache[path.resolve(__dirname, relativePath)];
  }
}

test('生产环境默认不应启用示例 seed', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnableSampleSeed = process.env.ENABLE_SAMPLE_SEED;

  process.env.NODE_ENV = 'production';
  delete process.env.ENABLE_SAMPLE_SEED;
  clearModules();

  try {
    const { shouldSeedSampleData } = require('../seed');
    assert.equal(shouldSeedSampleData(), false);
  } finally {
    clearModules();

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousEnableSampleSeed === undefined) {
      delete process.env.ENABLE_SAMPLE_SEED;
    } else {
      process.env.ENABLE_SAMPLE_SEED = previousEnableSampleSeed;
    }

  }
});

test('显式开启时应允许示例 seed', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousEnableSampleSeed = process.env.ENABLE_SAMPLE_SEED;

  process.env.NODE_ENV = 'production';
  process.env.ENABLE_SAMPLE_SEED = 'true';
  clearModules();

  try {
    const { shouldSeedSampleData } = require('../seed');
    assert.equal(shouldSeedSampleData(), true);
  } finally {
    clearModules();

    if (previousNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }

    if (previousEnableSampleSeed === undefined) {
      delete process.env.ENABLE_SAMPLE_SEED;
    } else {
      process.env.ENABLE_SAMPLE_SEED = previousEnableSampleSeed;
    }

  }
});

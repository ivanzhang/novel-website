const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createTestDb } = require('./helpers/test-db');

function loadSeedModule() {
  const seedPath = path.resolve(__dirname, '../seed.js');
  delete require.cache[seedPath];
  return require('../seed');
}

test('runSeed 应该兼容 node:sqlite fallback 并可重复执行', () => {
  const db = createTestDb();

  try {
    const { runSeed } = loadSeedModule();

    assert.doesNotThrow(() => {
      runSeed();
      runSeed();
    });

    const novels = db.prepare('SELECT COUNT(*) as count FROM novels').get();
    assert.ok(novels.count > 0);
  } finally {
    db.close();
  }
});

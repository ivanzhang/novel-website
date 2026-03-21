const test = require('node:test');
const assert = require('node:assert/strict');

const { createTestDb } = require('./helpers/test-db');

test('db 初始化应创建后台导入相关表', () => {
  const db = createTestDb();
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const tableNames = tables.map((table) => table.name);

    assert.ok(tableNames.includes('import_jobs'));
    assert.ok(tableNames.includes('import_items'));
    assert.ok(tableNames.includes('source_records'));
    assert.ok(tableNames.includes('categories'));
    assert.ok(tableNames.includes('tags'));
    assert.ok(tableNames.includes('novel_aliases'));
  } finally {
    db.close();
  }
});

test('db 初始化应创建后台导入相关索引', () => {
  const db = createTestDb();
  try {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all();
    const indexNames = indexes.map((index) => index.name);

    assert.ok(indexNames.includes('idx_import_items_job_id'));
    assert.ok(indexNames.includes('idx_import_items_source_record_id'));
    assert.ok(indexNames.includes('idx_source_records_source_key'));
    assert.ok(indexNames.includes('idx_categories_name'));
    assert.ok(indexNames.includes('idx_tags_name'));
    assert.ok(indexNames.includes('idx_novel_aliases_novel_id'));
  } finally {
    db.close();
  }
});

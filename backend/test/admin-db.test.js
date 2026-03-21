const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { createTestDb } = require('./helpers/test-db');

function withLegacySourceRecordSchema(callback) {
  const originalMkdtempSync = fs.mkdtempSync;

  fs.mkdtempSync = (prefix) => {
    const tempDir = originalMkdtempSync(prefix);
    const legacyDb = new DatabaseSync(path.join(tempDir, 'test.db'));

    legacyDb.exec(`
      CREATE TABLE source_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_key TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'novel',
        raw_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX idx_source_records_source_key ON source_records(source_key);
    `);
    legacyDb.close();

    return tempDir;
  };

  try {
    return callback();
  } finally {
    fs.mkdtempSync = originalMkdtempSync;
  }
}

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

test('source_records 应该以 source_type 和 source_key 保持唯一', () => {
  const db = createTestDb();
  try {
    db.prepare(
      'INSERT INTO source_records (source_type, source_key, raw_data) VALUES (?, ?, ?)'
    ).run('novel', '2530', '{"title":"万相之王"}');

    assert.doesNotThrow(() => {
      db.prepare(
        'INSERT INTO source_records (source_type, source_key, raw_data) VALUES (?, ?, ?)'
      ).run('biquge', '2530', '{"title":"另一部作品"}');
    });

    assert.throws(() => {
      db.prepare(
        'INSERT INTO source_records (source_type, source_key, raw_data) VALUES (?, ?, ?)'
      ).run('novel', '2530', '{"title":"重复作品"}');
    }, /UNIQUE constraint failed/i);
  } finally {
    db.close();
  }
});

test('import_items 应该通过 UNIQUE(job_id, source_record_id) 约束去重', () => {
  const db = createTestDb();
  try {
    const foreignKeyRows = db.prepare('PRAGMA foreign_keys').all();
    assert.equal(foreignKeyRows[0].foreign_keys, 1);

    const jobId = db.prepare('INSERT INTO import_jobs (source_name) VALUES (?)').run('biquge').lastInsertRowid;
    const sourceRecordId = db.prepare(
      'INSERT INTO source_records (source_type, source_key, raw_data) VALUES (?, ?, ?)'
    ).run('novel', '2530', '{"title":"万相之王"}').lastInsertRowid;

    db.prepare('INSERT INTO import_items (job_id, source_record_id) VALUES (?, ?)').run(jobId, sourceRecordId);

    assert.throws(() => {
      db.prepare('INSERT INTO import_items (job_id, source_record_id) VALUES (?, ?)').run(jobId, sourceRecordId);
    }, /UNIQUE constraint failed/i);
  } finally {
    db.close();
  }
});

test('import_items 在 foreign_keys = ON 时应拒绝无效外键', () => {
  const db = createTestDb();
  try {
    assert.throws(() => {
      db.prepare('INSERT INTO import_items (job_id, source_record_id) VALUES (?, ?)').run(999999, 888888);
    }, /FOREIGN KEY constraint failed/i);
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
    assert.ok(indexNames.includes('idx_source_records_source_type_source_key'));
    assert.ok(indexNames.includes('idx_categories_name'));
    assert.ok(indexNames.includes('idx_tags_name'));
    assert.ok(indexNames.includes('idx_novel_aliases_novel_id'));

    const sourceRecordUniqueIndexes = db.prepare('PRAGMA index_list(source_records)').all()
      .filter((index) => index.unique === 1);

    assert.ok(sourceRecordUniqueIndexes.some((index) => {
      const columns = db.prepare(`PRAGMA index_info(${index.name})`).all().map((row) => row.name);
      return columns.length === 2
        && columns.includes('source_type')
        && columns.includes('source_key');
    }));
  } finally {
    db.close();
  }
});

test('db 初始化应迁移旧的 source_records 单列唯一索引', () => {
  withLegacySourceRecordSchema(() => {
    const db = createTestDb();
    try {
      db.prepare(
        'INSERT INTO source_records (source_type, source_key, raw_data) VALUES (?, ?, ?)'
      ).run('novel', '2530', '{"title":"万相之王"}');

      assert.doesNotThrow(() => {
        db.prepare(
          'INSERT INTO source_records (source_type, source_key, raw_data) VALUES (?, ?, ?)'
        ).run('biquge', '2530', '{"title":"另一部作品"}');
      });
    } finally {
      db.close();
    }
  });
});

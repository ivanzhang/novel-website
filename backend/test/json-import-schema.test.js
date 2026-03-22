const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const { createTestDb } = require('./helpers/test-db');

function getTableColumns(db, tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
}

function withLegacyNovelChapterSchema(callback) {
  const originalMkdtempSync = fs.mkdtempSync;

  fs.mkdtempSync = (prefix) => {
    const tempDir = originalMkdtempSync(prefix);
    const legacyDb = new DatabaseSync(path.join(tempDir, 'test.db'));

    legacyDb.exec(`
      CREATE TABLE novels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        content TEXT,
        is_premium INTEGER DEFAULT 0,
        chapter_count INTEGER DEFAULT 0,
        description TEXT,
        free_chapters INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        novel_id INTEGER NOT NULL,
        chapter_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        is_premium INTEGER DEFAULT 0,
        word_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
        UNIQUE(novel_id, chapter_number)
      );
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

class BetterSqlite3Compat {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.transactionDepth = 0;
  }

  pragma(statement) {
    this.db.exec(`PRAGMA ${statement};`);
    return this;
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  prepare(sql) {
    const statement = this.db.prepare(sql);

    return {
      run: (...params) => statement.run(...params),
      get: (...params) => statement.get(...params),
      all: (...params) => statement.all(...params),
    };
  }

  transaction(fn) {
    const db = this;

    return function transactionWrapper(...args) {
      const depth = db.transactionDepth;
      const savepointName = `sp_${depth + 1}`;
      const outerTransaction = depth === 0;

      if (outerTransaction) {
        db.db.exec('BEGIN');
      } else {
        db.db.exec(`SAVEPOINT ${savepointName}`);
      }

      db.transactionDepth += 1;

      try {
        const result = fn.apply(this, args);
        db.transactionDepth -= 1;

        if (outerTransaction) {
          db.db.exec('COMMIT');
        } else {
          db.db.exec(`RELEASE SAVEPOINT ${savepointName}`);
        }

        return result;
      } catch (error) {
        db.transactionDepth -= 1;

        if (outerTransaction) {
          db.db.exec('ROLLBACK');
        } else {
          db.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          db.db.exec(`RELEASE SAVEPOINT ${savepointName}`);
        }

        throw error;
      }
    };
  }

  close() {
    this.db.close();
  }
}

function loadDbModuleAtPath(dbPath, betterSqlite3Export = BetterSqlite3Compat) {
  const previousDbPath = process.env.DB_PATH;
  const dbModulePath = path.resolve(__dirname, '../db.js');
  const betterSqlite3ModulePath = require.resolve('better-sqlite3');
  const previousBetterSqlite3Module = require.cache[betterSqlite3ModulePath];

  process.env.DB_PATH = dbPath;
  delete require.cache[dbModulePath];

  try {
    require.cache[betterSqlite3ModulePath] = {
      id: betterSqlite3ModulePath,
      filename: betterSqlite3ModulePath,
      loaded: true,
      exports: betterSqlite3Export,
    };

    const db = require(dbModulePath);

    return db;
  } finally {
    if (previousBetterSqlite3Module === undefined) {
      delete require.cache[betterSqlite3ModulePath];
    } else {
      require.cache[betterSqlite3ModulePath] = previousBetterSqlite3Module;
    }

    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }
  }
}

test('db 初始化应创建 JSON 导入元数据列和索引', () => {
  const db = createTestDb();
  try {
    assert.deepEqual(getTableColumns(db, 'novels'), [
      'id',
      'title',
      'author',
      'content',
      'is_premium',
      'chapter_count',
      'description',
      'free_chapters',
      'created_at',
      'source_site',
      'source_book_id',
      'source_category',
      'primary_category',
      'cover_url',
      'content_storage',
    ]);

    assert.deepEqual(getTableColumns(db, 'chapters'), [
      'id',
      'novel_id',
      'chapter_number',
      'title',
      'content',
      'is_premium',
      'word_count',
      'created_at',
      'source_chapter_id',
      'content_file_path',
      'content_preview',
    ]);

    const indexNames = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all()
      .map((row) => row.name);

    assert.ok(indexNames.includes('idx_novels_source_site_source_book_id'));
    assert.ok(indexNames.includes('idx_chapters_content_file_path'));
  } finally {
    db.close();
  }
});

test('db 初始化应自动升级旧版 novels 和 chapters 表', () => {
  withLegacyNovelChapterSchema(() => {
    const db = createTestDb();
    try {
      assert.deepEqual(getTableColumns(db, 'novels'), [
        'id',
        'title',
        'author',
        'content',
        'is_premium',
        'chapter_count',
        'description',
        'free_chapters',
        'created_at',
        'source_site',
        'source_book_id',
        'source_category',
        'primary_category',
        'cover_url',
        'content_storage',
      ]);

      assert.deepEqual(getTableColumns(db, 'chapters'), [
        'id',
        'novel_id',
        'chapter_number',
        'title',
        'content',
        'is_premium',
        'word_count',
        'created_at',
        'source_chapter_id',
        'content_file_path',
        'content_preview',
      ]);
    } finally {
      db.close();
    }
  });
});

test('db 初始化可对同一数据库文件重复执行', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-website-db-repeat-'));
  const dbPath = path.join(tempDir, 'test.db');

  const firstDb = loadDbModuleAtPath(dbPath);
  try {
    assert.deepEqual(getTableColumns(firstDb, 'novels'), [
      'id',
      'title',
      'author',
      'content',
      'is_premium',
      'chapter_count',
      'description',
      'free_chapters',
      'created_at',
      'source_site',
      'source_book_id',
      'source_category',
      'primary_category',
      'cover_url',
      'content_storage',
    ]);
  } finally {
    firstDb.close();
  }

  const secondDb = loadDbModuleAtPath(dbPath);
  try {
    assert.deepEqual(getTableColumns(secondDb, 'chapters'), [
      'id',
      'novel_id',
      'chapter_number',
      'title',
      'content',
      'is_premium',
      'word_count',
      'created_at',
      'source_chapter_id',
      'content_file_path',
      'content_preview',
    ]);
  } finally {
    secondDb.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('db 初始化在 better-sqlite3 不可用时应回退到 node:sqlite', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-website-db-fallback-'));
  const dbPath = path.join(tempDir, 'test.db');

  class BrokenBetterSqlite3 {
    constructor() {
      throw new Error('Could not locate the bindings file');
    }
  }

  const db = loadDbModuleAtPath(dbPath, BrokenBetterSqlite3);

  try {
    assert.deepEqual(getTableColumns(db, 'novels'), [
      'id',
      'title',
      'author',
      'content',
      'is_premium',
      'chapter_count',
      'description',
      'free_chapters',
      'created_at',
      'source_site',
      'source_book_id',
      'source_category',
      'primary_category',
      'cover_url',
      'content_storage',
    ]);

    db.prepare('INSERT INTO novels (title, author, content) VALUES (?, ?, ?)').run('测试书', '作者', '');
    const row = db.prepare('SELECT title, author FROM novels').get();
    assert.equal(row.title, '测试书');
    assert.equal(row.author, '作者');
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

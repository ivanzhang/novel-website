function createNodeSqliteCompat(filename) {
  const { DatabaseSync } = require('node:sqlite');

  return new (class NodeSqliteCompat {
    constructor() {
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
      const database = this;

      return function transactionWrapper(...args) {
        const depth = database.transactionDepth;
        const savepointName = `sp_${depth + 1}`;
        const outerTransaction = depth === 0;

        if (outerTransaction) {
          database.db.exec('BEGIN');
        } else {
          database.db.exec(`SAVEPOINT ${savepointName}`);
        }

        database.transactionDepth += 1;

        try {
          const result = fn.apply(this, args);
          database.transactionDepth -= 1;

          if (outerTransaction) {
            database.db.exec('COMMIT');
          } else {
            database.db.exec(`RELEASE SAVEPOINT ${savepointName}`);
          }

          return result;
        } catch (error) {
          database.transactionDepth -= 1;

          if (outerTransaction) {
            database.db.exec('ROLLBACK');
          } else {
            database.db.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            database.db.exec(`RELEASE SAVEPOINT ${savepointName}`);
          }

          throw error;
        }
      };
    }

    close() {
      this.db.close();
    }
  })();
}

function createDatabase(filename) {
  try {
    const BetterSqlite3 = require('better-sqlite3');
    return new BetterSqlite3(filename);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(`better-sqlite3 不可用，回退到 node:sqlite: ${error.message}`);
    }

    return createNodeSqliteCompat(filename);
  }
}

const db = createDatabase(process.env.DB_PATH || 'novels.db');

// 启用 WAL 模式提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function getTableColumns(tableName) {
  return db.prepare(`PRAGMA table_info(${tableName})`).all().map((row) => row.name);
}

function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = getTableColumns(tableName);

  if (!columns.includes(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition};`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_member INTEGER DEFAULT 0,
    member_expire DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS novels (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    is_premium INTEGER DEFAULT 0,
    chapter_count INTEGER DEFAULT 0,
    description TEXT,
    free_chapters INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_site TEXT,
    source_category TEXT,
    primary_category TEXT,
    cover_url TEXT,
    storage_type TEXT DEFAULT 'local'
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    novel_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_premium INTEGER DEFAULT 0,
    word_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_chapter_id TEXT,
    content_file_path TEXT,
    content_cdn_url TEXT,
    content_preview TEXT,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    UNIQUE(novel_id, chapter_number)
  );

  CREATE TABLE IF NOT EXISTS reading_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    novel_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    scroll_position INTEGER DEFAULT 0,
    reading_time INTEGER DEFAULT 0,
    last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    novel_title TEXT,
    chapter_title TEXT,
    author TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    UNIQUE(user_id, novel_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    novel_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    novel_title TEXT,
    chapter_title TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    UNIQUE(user_id, novel_id, chapter_number)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    novel_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    novel_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    UNIQUE(user_id, novel_id)
  );

  CREATE TABLE IF NOT EXISTS import_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    started_at DATETIME,
    finished_at DATETIME,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

ensureColumn('novels', 'source_site', 'source_site TEXT');
ensureColumn('novels', 'source_category', 'source_category TEXT');
ensureColumn('novels', 'primary_category', 'primary_category TEXT');
ensureColumn('novels', 'cover_url', 'cover_url TEXT');
ensureColumn('novels', 'storage_type', "storage_type TEXT DEFAULT 'local'");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_chapters_novel_id ON chapters(novel_id);
  CREATE INDEX IF NOT EXISTS idx_chapters_novel_chapter ON chapters(novel_id, chapter_number);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_user_novel ON reading_progress(user_id, novel_id);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_user_novel ON bookmarks(user_id, novel_id);
  CREATE INDEX IF NOT EXISTS idx_comments_novel_chapter ON comments(novel_id, chapter_number);
  CREATE INDEX IF NOT EXISTS idx_ratings_novel ON ratings(novel_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_novels_title ON novels(title);
`);

db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS novels_fts USING fts5(id UNINDEXED, title, author)`);

try {
  db.exec(`CREATE TRIGGER IF NOT EXISTS novels_fts_insert AFTER INSERT ON novels BEGIN INSERT INTO novels_fts(id, title, author) VALUES (new.id, new.title, new.author); END`);
} catch (e) {}
try {
  db.exec(`CREATE TRIGGER IF NOT EXISTS novels_fts_delete AFTER DELETE ON novels BEGIN DELETE FROM novels_fts WHERE id = old.id; END`);
} catch (e) {}
try {
  db.exec(`CREATE TRIGGER IF NOT EXISTS novels_fts_update AFTER UPDATE ON novels BEGIN UPDATE novels_fts SET title = new.title, author = new.author WHERE id = new.id; END`);
} catch (e) {}

module.exports = db;

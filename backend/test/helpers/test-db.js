const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function createTestDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-website-db-'));
  const dbPath = path.join(tempDir, 'test.db');
  const previousDbPath = process.env.DB_PATH;
  const dbModulePath = path.resolve(__dirname, '../../db.js');
  const betterSqlite3ModulePath = require.resolve('better-sqlite3');
  const previousBetterSqlite3Module = require.cache[betterSqlite3ModulePath];

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

  process.env.DB_PATH = dbPath;
  delete require.cache[dbModulePath];

  try {
    require.cache[betterSqlite3ModulePath] = {
      id: betterSqlite3ModulePath,
      filename: betterSqlite3ModulePath,
      loaded: true,
      exports: BetterSqlite3Compat,
    };

    let db;
    try {
      db = require(dbModulePath);
    } catch (error) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      throw error;
    }

    const close = db.close.bind(db);

    db.__path = dbPath;
    db.__tempDir = tempDir;

    db.close = () => {
      close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    };

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

module.exports = {
  createTestDb,
};

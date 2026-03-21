const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function createTestDb() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-website-db-'));
  const dbPath = path.join(tempDir, 'test.db');
  const previousDbPath = process.env.DB_PATH;
  const dbModulePath = path.resolve(__dirname, '../../db.js');
  const originalLoad = Module._load;

  class BetterSqlite3Compat {
    constructor(filename) {
      this.db = new DatabaseSync(filename);
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

    close() {
      this.db.close();
    }
  }

  process.env.DB_PATH = dbPath;
  delete require.cache[dbModulePath];

  try {
    Module._load = function patchedLoad(request, parent, isMain) {
      if (request === 'better-sqlite3') {
        return BetterSqlite3Compat;
      }

      return originalLoad.call(this, request, parent, isMain);
    };

    return require(dbModulePath);
  } finally {
    Module._load = originalLoad;

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

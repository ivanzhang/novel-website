const Database = require('better-sqlite3');
const db = new Database('novels.db');

// 初始化数据库表
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
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    content TEXT NOT NULL,
    is_premium INTEGER DEFAULT 0,
    chapter_count INTEGER DEFAULT 0,
    description TEXT,
    free_chapters INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    UNIQUE(novel_id, chapter_number)
  );

  CREATE TABLE IF NOT EXISTS reading_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    novel_id INTEGER NOT NULL,
    chapter_id INTEGER NOT NULL,
    scroll_position INTEGER DEFAULT 0,
    reading_time INTEGER DEFAULT 0,
    last_read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
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
    chapter_id INTEGER NOT NULL,
    chapter_number INTEGER NOT NULL,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    chapter_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
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
`);

// 创建索引
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_chapters_novel_id ON chapters(novel_id);
  CREATE INDEX IF NOT EXISTS idx_chapters_novel_chapter ON chapters(novel_id, chapter_number);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_progress_user_novel ON reading_progress(user_id, novel_id);
  CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
  CREATE INDEX IF NOT EXISTS idx_comments_chapter ON comments(chapter_id);
  CREATE INDEX IF NOT EXISTS idx_ratings_novel ON ratings(novel_id);
`);

// 数据迁移函数：将现有小说拆分为章节
function migrateNovelsToChapters() {
  const novels = db.prepare('SELECT * FROM novels WHERE chapter_count = 0').all();

  for (const novel of novels) {
    // 使用正则表达式拆分章节
    const chapterRegex = /第[一二三四五六七八九十百千万\d]+章[：:]\s*(.+?)(?=\n\n|$)/g;
    const contentParts = novel.content.split(chapterRegex);

    let chapterNumber = 1;
    let chapterCount = 0;

    // 如果没有匹配到章节标记，将整个内容作为第一章
    if (contentParts.length <= 1) {
      const insertChapter = db.prepare(
        'INSERT OR IGNORE INTO chapters (novel_id, chapter_number, title, content, is_premium, word_count) VALUES (?, ?, ?, ?, ?, ?)'
      );
      // 章节不继承小说的 is_premium，由小说级和 free_chapters 控制
      insertChapter.run(novel.id, 1, '第一章', novel.content, 0, novel.content.length);
      chapterCount = 1;
    } else {
      // 处理拆分后的章节
      for (let i = 1; i < contentParts.length; i += 2) {
        const title = contentParts[i]?.trim() || `第${chapterNumber}章`;
        const content = contentParts[i + 1]?.trim() || '';

        if (content) {
          const insertChapter = db.prepare(
            'INSERT OR IGNORE INTO chapters (novel_id, chapter_number, title, content, is_premium, word_count) VALUES (?, ?, ?, ?, ?, ?)'
          );
          // 章节不继承小说的 is_premium，由小说级和 free_chapters 控制
          insertChapter.run(novel.id, chapterNumber, title, content, 0, content.length);
          chapterNumber++;
          chapterCount++;
        }
      }
    }

    // 更新小说的章节数
    db.prepare('UPDATE novels SET chapter_count = ? WHERE id = ?').run(chapterCount, novel.id);
  }
}

// 插入示例小说数据
const insertNovel = db.prepare('INSERT OR IGNORE INTO novels (id, title, author, content, is_premium, description, free_chapters) VALUES (?, ?, ?, ?, ?, ?, ?)');
insertNovel.run(1, '修仙传奇', '云中客', '第一章：少年立志\n\n在青云山脚下，有一个小村庄...\n\n第二章：拜师学艺\n\n三年后，少年终于等来了机会...', 0, '一个少年的修仙之路', 0);
insertNovel.run(2, '都市仙尊', '笔墨生', '第一章：重生归来\n\n陈风睁开眼睛，发现自己回到了十年前...\n\n第二章：重掌力量\n\n熟悉的房间，熟悉的一切...（VIP章节）', 1, '仙尊重生都市，再创辉煌', 1);

// 更新现有小说的 free_chapters
db.prepare('UPDATE novels SET free_chapters = 1 WHERE id = 2 AND free_chapters = 0').run();

// 执行数据迁移
migrateNovelsToChapters();

module.exports = db;

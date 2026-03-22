const db = require('./db');

// 数据迁移：将现有小说拆分为章节
function migrateNovelsToChapters() {
  const novels = db.prepare("SELECT * FROM novels WHERE chapter_count = 0 AND content IS NOT NULL AND content != ''").all();

  for (const novel of novels) {
    const chapterRegex = /第[一二三四五六七八九十百千万\d]+章[：:]\s*(.+?)(?=\n\n|$)/g;
    const contentParts = novel.content.split(chapterRegex);

    let chapterNumber = 1;
    let chapterCount = 0;

    if (contentParts.length <= 1) {
      const insertChapter = db.prepare(
        'INSERT OR IGNORE INTO chapters (novel_id, chapter_number, title, content, is_premium, word_count) VALUES (?, ?, ?, ?, ?, ?)'
      );
      insertChapter.run(novel.id, 1, '第一章', novel.content, 0, novel.content.length);
      chapterCount = 1;
    } else {
      for (let i = 1; i < contentParts.length; i += 2) {
        const title = contentParts[i]?.trim() || `第${chapterNumber}章`;
        const content = contentParts[i + 1]?.trim() || '';

        if (content) {
          const insertChapter = db.prepare(
            'INSERT OR IGNORE INTO chapters (novel_id, chapter_number, title, content, is_premium, word_count) VALUES (?, ?, ?, ?, ?, ?)'
          );
          insertChapter.run(novel.id, chapterNumber, title, content, 0, content.length);
          chapterNumber++;
          chapterCount++;
        }
      }
    }

    db.prepare('UPDATE novels SET chapter_count = ? WHERE id = ?').run(chapterCount, novel.id);
  }
}

// 插入示例小说数据（仅首次启动）
function seedSampleData() {
  const count = db.prepare('SELECT COUNT(*) as count FROM novels').get().count;
  if (count > 0) return;

  const insertNovel = db.prepare('INSERT INTO novels (title, author, content, is_premium, description, free_chapters) VALUES (?, ?, ?, ?, ?, ?)');
  insertNovel.run('修仙传奇', '云中客', '第一章：少年立志\n\n在青云山脚下，有一个小村庄...\n\n第二章：拜师学艺\n\n三年后，少年终于等来了机会...', 0, '一个少年的修仙之路', 0);
  insertNovel.run('都市仙尊', '笔墨生', '第一章：重生归来\n\n陈风睁开眼睛，发现自己回到了十年前...\n\n第二章：重掌力量\n\n熟悉的房间，熟悉的一切...（VIP章节）', 1, '仙尊重生都市，再创辉煌', 1);
}

function runSeed() {
  seedSampleData();
  migrateNovelsToChapters();
  console.log('数据库初始化完成');
}

module.exports = { runSeed, migrateNovelsToChapters };

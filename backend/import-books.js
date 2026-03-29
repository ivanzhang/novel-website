const fs = require('fs');
const path = require('path');
const db = require('./db');

const BOOKS_DIR = path.join(__dirname, '..', 'storage', 'json', 'all', 'books');
const BATCH_SIZE = 1000;

function importNovels() {
  console.log('开始导入小说到数据库...');
  console.log(`书籍目录: ${BOOKS_DIR}`);

  if (!fs.existsSync(BOOKS_DIR)) {
    console.error(`目录不存在: ${BOOKS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.json'));
  console.log(`找到 ${files.length} 本书`);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO novels (id, title, author, is_premium, chapter_count, description, free_chapters, primary_category, cover_url, storage_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'local')
  `);

  let imported = 0;
  let errors = 0;
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(BOOKS_DIR, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const book = JSON.parse(content);

      if (!book.bookId || !book.title) {
        errors++;
        continue;
      }

      stmt.run(
        book.bookId,
        book.title,
        book.author || '',
        0,
        book.chapterCount || 0,
        book.intro || '',
        0,
        book.category || '',
        `/storage/json/all/covers/${book.bookId}.jpg`
      );

      imported++;

      if (imported % BATCH_SIZE === 0) {
        console.log(`已导入 ${imported} 本...`);
      }
    } catch (error) {
      errors++;
      if (errors <= 10) {
        console.error(`导入失败 ${file}: ${error.message}`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n导入完成!`);
  console.log(`成功: ${imported}`);
  console.log(`失败: ${errors}`);
  console.log(`耗时: ${elapsed}s`);
}

function rebuildIndexes() {
  console.log('\n重建索引...');
  db.exec(`
    REINDEX;
    ANALYZE;
  `);
  console.log('索引重建完成');
}

function rebuildFTS() {
  console.log('\n重建全文索引...');
  try {
    db.exec(`INSERT INTO novels_fts(novels_fts) VALUES('rebuild')`);
    console.log('全文索引重建完成');
  } catch (e) {
    console.log('FTS rebuild skipped (may already be current)');
  }
}

if (require.main === module) {
  importNovels();
  rebuildIndexes();
  rebuildFTS();
}

module.exports = { importNovels, rebuildIndexes };

const db = require('./db');

function shouldSeedSampleData() {
  return process.env.ENABLE_SAMPLE_SEED === 'true' || process.env.NODE_ENV === 'test';
}

// 插入示例小说数据（仅首次启动）
function seedSampleData() {
  const count = db.prepare('SELECT COUNT(*) as count FROM novels').get().count;
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT OR IGNORE INTO novels (id, title, author, is_premium, chapter_count, description, free_chapters) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insert.run(1, '修仙传奇', '云中客', 0, 50, '一个少年的修仙之路', 0);
  insert.run(2, '都市仙尊', '笔墨生', 1, 30, '仙尊重生都市，再创辉煌', 1);
  insert.run(3, '大唐双龙传', '黄易', 0, 40, '隋末乱世，两少年崛起', 0);
}

function runSeed() {
  if (shouldSeedSampleData()) {
    seedSampleData();
  }
  console.log('数据库初始化完成');
}

module.exports = { runSeed, shouldSeedSampleData };

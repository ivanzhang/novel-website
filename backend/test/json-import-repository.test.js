const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { createTestDb } = require('./helpers/test-db');

function loadRepository() {
  const repositoryPath = path.resolve(__dirname, '../json-import/repository.js');
  delete require.cache[repositoryPath];
  return require('../json-import/repository');
}

function seedNovel(db, novel) {
  return db.prepare(`
    INSERT INTO novels (
      title,
      author,
      content,
      is_premium,
      chapter_count,
      description,
      free_chapters,
      source_site,
      source_book_id,
      source_category,
      primary_category,
      cover_url,
      content_storage
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    novel.title,
    novel.author,
    novel.content ?? '',
    novel.is_premium ?? 0,
    novel.chapter_count ?? 0,
    novel.description ?? '',
    novel.free_chapters ?? 0,
    novel.source_site ?? null,
    novel.source_book_id ?? null,
    novel.source_category ?? null,
    novel.primary_category ?? null,
    novel.cover_url ?? null,
    novel.content_storage ?? null
  ).lastInsertRowid;
}

function seedChapter(db, chapter) {
  return db.prepare(`
    INSERT INTO chapters (
      novel_id,
      chapter_number,
      title,
      content,
      is_premium,
      word_count,
      source_chapter_id,
      content_file_path,
      content_preview
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    chapter.novel_id,
    chapter.chapter_number,
    chapter.title,
    chapter.content ?? '',
    chapter.is_premium ?? 0,
    chapter.word_count ?? 0,
    chapter.source_chapter_id ?? null,
    chapter.content_file_path ?? null,
    chapter.content_preview ?? null
  ).lastInsertRowid;
}

function seedUser(db, username) {
  return db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, 'secret').lastInsertRowid;
}

test('findNovelForImport 应优先按 source_site + source_book_id 查找已有小说', () => {
  const db = createTestDb();
  try {
    const novelId = seedNovel(db, {
      title: '旧标题',
      author: '旧作者',
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '2530',
    });

    seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
      source_site: 'https://example.com',
      source_book_id: '9999',
    });

    const { findNovelForImport } = loadRepository();
    const found = findNovelForImport({
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '2530',
      title: '万相之王',
      author: '天蚕土豆',
    });

    assert.equal(found.id, novelId);
    assert.equal(found.title, '旧标题');
  } finally {
    db.close();
  }
});

test('findNovelForImport 在提供 source_book_id 但未命中时不回退 title + author', () => {
  const db = createTestDb();
  try {
    seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
    });

    const { findNovelForImport } = loadRepository();
    const found = findNovelForImport({
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '2530',
      title: '万相之王',
      author: '天蚕土豆',
    });

    assert.equal(found, null);
  } finally {
    db.close();
  }
});

test('findNovelForImport 在没有 source_book_id 时应回退到 title + author 归一化匹配', () => {
  const db = createTestDb();
  try {
    const novelId = seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
    });

    seedNovel(db, {
      title: '别的书',
      author: '别的作者',
    });

    const { findNovelForImport } = loadRepository();
    const found = findNovelForImport({
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '',
      title: '万相之王 最新章节 无弹窗',
      author: '天蚕土豆著',
    });

    assert.equal(found.id, novelId);
  } finally {
    db.close();
  }
});

test('findNovelForImport 在 title + author 回退命中多条时应抛错拒绝更新', () => {
  const db = createTestDb();
  try {
    seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
    });
    seedNovel(db, {
      title: '万相之王 最新章节 无弹窗',
      author: '天蚕土豆著',
    });

    const { findNovelForImport } = loadRepository();

    assert.throws(() => findNovelForImport({
      source_site: 'https://0732.bqg291.cc',
      title: '万相之王',
      author: '天蚕土豆',
    }), /title \+ author 回退命中多条已有小说/);
  } finally {
    db.close();
  }
});

test('upsertNovel 应覆盖更新已有小说元数据', () => {
  const db = createTestDb();
  try {
    const novelId = seedNovel(db, {
      title: '旧标题',
      author: '旧作者',
      description: '旧简介',
      chapter_count: 1,
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '2530',
      source_category: '玄幻奇幻',
      primary_category: '玄幻',
      cover_url: 'https://example.com/old.jpg',
      content_storage: 'legacy',
    });

    const { upsertNovel } = loadRepository();
    const returnedId = upsertNovel({
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '2530',
      title: '万相之王',
      author: '天蚕土豆',
      description: '天地间有万相',
      chapterCount: 1837,
      freeChapters: 12,
      source_category: '武侠仙侠',
      primary_category: '仙侠',
      cover_url: 'https://www.bqg291.cc/bookimg/2/2530.jpg',
      content_storage: 'json',
    });

    assert.equal(returnedId, novelId);

    const updated = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
    assert.equal(updated.title, '万相之王');
    assert.equal(updated.author, '天蚕土豆');
    assert.equal(updated.description, '天地间有万相');
    assert.equal(updated.chapter_count, 1837);
    assert.equal(updated.free_chapters, 12);
    assert.equal(updated.source_category, '武侠仙侠');
    assert.equal(updated.primary_category, '仙侠');
    assert.equal(updated.cover_url, 'https://www.bqg291.cc/bookimg/2/2530.jpg');
    assert.equal(updated.content_storage, 'json');
  } finally {
    db.close();
  }
});

test('upsertNovel 通过 title + author 回退命中时应保留旧来源键', () => {
  const db = createTestDb();
  try {
    const novelId = seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '2530',
      description: '旧简介',
    });

    const { upsertNovel } = loadRepository();
    const returnedId = upsertNovel({
      title: '万相之王 最新章节 无弹窗',
      author: '天蚕土豆著',
      description: '天地间有万相',
      chapterCount: 1837,
      freeChapters: 12,
      content_storage: 'json',
    });

    assert.equal(returnedId, novelId);

    const updated = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
    assert.equal(updated.source_site, 'https://0732.bqg291.cc');
    assert.equal(updated.source_book_id, '2530');
    assert.equal(updated.title, '万相之王 最新章节 无弹窗');
    assert.equal(updated.author, '天蚕土豆著');
    assert.equal(updated.description, '天地间有万相');
  } finally {
    db.close();
  }
});

test('upsertNovel 输入空字符串来源键时应保留旧来源键', () => {
  const db = createTestDb();
  try {
    const novelId = seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '2530',
      description: '旧简介',
    });

    const { upsertNovel } = loadRepository();
    const returnedId = upsertNovel({
      title: '万相之王 最新章节 无弹窗',
      author: '天蚕土豆著',
      source_site: '',
      source_book_id: '',
      description: '天地间有万相',
      chapterCount: 1837,
      freeChapters: 12,
      content_storage: 'json',
    });

    assert.equal(returnedId, novelId);

    const updated = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
    assert.equal(updated.source_site, 'https://0732.bqg291.cc');
    assert.equal(updated.source_book_id, '2530');
  } finally {
    db.close();
  }
});

test('replaceChapters 应删除旧章节并重建目录', () => {
  const db = createTestDb();
  try {
    const novelId = seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
      chapter_count: 2,
    });

    seedChapter(db, {
      novel_id: novelId,
      chapter_number: 1,
      title: '旧第一章',
      content: '旧正文 1',
      content_file_path: 'legacy/1.json',
      content_preview: '旧预览 1',
    });
    seedChapter(db, {
      novel_id: novelId,
      chapter_number: 2,
      title: '旧第二章',
      content: '旧正文 2',
      content_file_path: 'legacy/2.json',
      content_preview: '旧预览 2',
    });

    const { replaceChapters } = loadRepository();
    replaceChapters(novelId, [
      {
        chapter_number: 1,
        title: '第1章 我有三个相宫',
        source_chapter_id: '1',
        content_file_path: 'chapters/2530/1.json',
        content_preview: '第一段 第二段',
      },
      {
        chapter_number: 2,
        title: '第2章 不想退婚的未婚妻',
        source_chapter_id: '2',
        content_file_path: 'chapters/2530/2.json',
        content_preview: '第三段 第四段',
      },
    ]);

    const chapters = db.prepare(
      'SELECT chapter_number, title, content, source_chapter_id, content_file_path, content_preview FROM chapters WHERE novel_id = ? ORDER BY chapter_number'
    ).all(novelId).map((row) => ({ ...row }));

    assert.deepEqual(chapters, [
      {
        chapter_number: 1,
        title: '第1章 我有三个相宫',
        content: '旧正文 1',
        source_chapter_id: '1',
        content_file_path: 'chapters/2530/1.json',
        content_preview: '第一段 第二段',
      },
      {
        chapter_number: 2,
        title: '第2章 不想退婚的未婚妻',
        content: '旧正文 2',
        source_chapter_id: '2',
        content_file_path: 'chapters/2530/2.json',
        content_preview: '第三段 第四段',
      },
    ]);

    const novel = db.prepare('SELECT chapter_count FROM novels WHERE id = ?').get(novelId);
    assert.equal(novel.chapter_count, 2);
  } finally {
    db.close();
  }
});

test('replaceChapters 应按 chapter_number 同步并保留关联的 chapter_id', () => {
  const db = createTestDb();
  try {
    const userId = seedUser(db, 'reader-1');
    const novelId = seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
      chapter_count: 2,
    });

    const chapter1Id = seedChapter(db, {
      novel_id: novelId,
      chapter_number: 1,
      title: '旧第一章',
      content: '旧正文 1',
      content_file_path: 'legacy/1.json',
      content_preview: '旧预览 1',
    });
    seedChapter(db, {
      novel_id: novelId,
      chapter_number: 2,
      title: '旧第二章',
      content: '旧正文 2',
      content_file_path: 'legacy/2.json',
      content_preview: '旧预览 2',
    });

    db.prepare(`
      INSERT INTO reading_progress (user_id, novel_id, chapter_id, scroll_position, reading_time)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, novelId, chapter1Id, 88, 123);

    const { replaceChapters } = loadRepository();
    replaceChapters(novelId, [
      {
        chapter_number: 1,
        title: '第1章 我有三个相宫',
        source_chapter_id: '1',
        content_file_path: 'chapters/2530/1.json',
        content_preview: '第一段 第二段',
      },
      {
        chapter_number: 3,
        title: '第3章 新章节',
        source_chapter_id: '3',
        content_file_path: 'chapters/2530/3.json',
        content_preview: '第三段 第四段',
      },
    ]);

    const chapter1 = db.prepare(
      'SELECT id, chapter_number, title, source_chapter_id, content_file_path, content_preview FROM chapters WHERE novel_id = ? AND chapter_number = ?'
    ).get(novelId, 1);

    assert.equal(chapter1.id, chapter1Id);
    assert.equal(chapter1.title, '第1章 我有三个相宫');
    assert.equal(chapter1.source_chapter_id, '1');
    assert.equal(chapter1.content_file_path, 'chapters/2530/1.json');
    assert.equal(chapter1.content_preview, '第一段 第二段');

    const chapter3 = db.prepare(
      'SELECT chapter_number, title, source_chapter_id, content_file_path, content_preview FROM chapters WHERE novel_id = ? AND chapter_number = ?'
    ).get(novelId, 3);

    assert.deepEqual({ ...chapter3 }, {
      chapter_number: 3,
      title: '第3章 新章节',
      source_chapter_id: '3',
      content_file_path: 'chapters/2530/3.json',
      content_preview: '第三段 第四段',
    });

    const removedChapter = db.prepare(
      'SELECT id FROM chapters WHERE novel_id = ? AND chapter_number = ?'
    ).get(novelId, 2);
    assert.equal(removedChapter, undefined);

    const progress = db.prepare(
      'SELECT id, user_id, novel_id, chapter_id, scroll_position, reading_time FROM reading_progress WHERE user_id = ? AND novel_id = ?'
    ).get(userId, novelId);

    assert.equal(progress.chapter_id, chapter1Id);
    assert.equal(progress.scroll_position, 88);
    assert.equal(progress.reading_time, 123);
  } finally {
    db.close();
  }
});

test('replaceChapters 更新已有章节时应保留正文和计数字段', () => {
  const db = createTestDb();
  try {
    const novelId = seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
      chapter_count: 1,
    });

    const chapter1Id = seedChapter(db, {
      novel_id: novelId,
      chapter_number: 1,
      title: '旧第一章',
      content: '原始正文',
      is_premium: 1,
      word_count: 321,
      source_chapter_id: 'old-1',
      content_file_path: 'legacy/1.json',
      content_preview: '旧预览',
    });

    const { replaceChapters } = loadRepository();
    replaceChapters(novelId, [
      {
        chapter_number: 1,
        title: '第1章 我有三个相宫',
        source_chapter_id: '1',
        content_file_path: 'chapters/2530/1.json',
        content_preview: '第一段 第二段',
      },
    ]);

    const chapter1 = db.prepare(
      'SELECT id, title, content, is_premium, word_count, source_chapter_id, content_file_path, content_preview FROM chapters WHERE id = ?'
    ).get(chapter1Id);

    assert.equal(chapter1.id, chapter1Id);
    assert.equal(chapter1.title, '第1章 我有三个相宫');
    assert.equal(chapter1.content, '原始正文');
    assert.equal(chapter1.is_premium, 1);
    assert.equal(chapter1.word_count, 321);
    assert.equal(chapter1.source_chapter_id, '1');
    assert.equal(chapter1.content_file_path, 'chapters/2530/1.json');
    assert.equal(chapter1.content_preview, '第一段 第二段');
  } finally {
    db.close();
  }
});

test('replaceChapters 应拒绝非正整数 chapter_number', () => {
  const db = createTestDb();
  try {
    const novelId = seedNovel(db, {
      title: '万相之王',
      author: '天蚕土豆',
      chapter_count: 0,
    });

    const { replaceChapters } = loadRepository();

    assert.throws(() => replaceChapters(novelId, [
      { chapter_number: 0, title: '零章' },
    ]), /chapter_number 必须是正整数/);

    assert.throws(() => replaceChapters(novelId, [
      { chapter_number: -1, title: '负一章' },
    ]), /chapter_number 必须是正整数/);

    assert.throws(() => replaceChapters(novelId, [
      { chapter_number: Number.NaN, title: 'NaN 章' },
    ]), /chapter_number 必须是正整数/);
  } finally {
    db.close();
  }
});

test('importNovelRecord 应在单书事务内回滚 upsertNovel 和 replaceChapters', () => {
  const db = createTestDb();
  try {
    const novelId = seedNovel(db, {
      title: '旧标题',
      author: '旧作者',
      description: '旧简介',
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '2530',
      chapter_count: 1,
    });

    seedChapter(db, {
      novel_id: novelId,
      chapter_number: 1,
      title: '旧第一章',
      content: '旧正文',
      content_file_path: 'legacy/1.json',
      content_preview: '旧预览',
    });

    const { importNovelRecord } = loadRepository();
    assert.equal(typeof importNovelRecord, 'function');
    const importInTransaction = () => importNovelRecord({
      source_site: 'https://0732.bqg291.cc',
      source_book_id: '2530',
      title: '万相之王',
      author: '天蚕土豆',
      description: '天地间有万相',
      chapterCount: 2,
      content_storage: 'json',
    }, [
      {
        chapter_number: 1,
        title: '第1章',
        content_file_path: 'chapters/2530/1.json',
        content_preview: '预览1',
      },
      {
        chapter_number: 1,
        title: '重复章节号',
        content_file_path: 'chapters/2530/2.json',
        content_preview: '预览2',
      },
    ]);

    assert.throws(importInTransaction);

    const novel = db.prepare('SELECT * FROM novels WHERE id = ?').get(novelId);
    assert.equal(novel.title, '旧标题');
    assert.equal(novel.author, '旧作者');
    assert.equal(novel.description, '旧简介');

    const chapters = db.prepare(
      'SELECT chapter_number, title, content_file_path, content_preview FROM chapters WHERE novel_id = ? ORDER BY chapter_number'
    ).all(novelId).map((row) => ({ ...row }));

    assert.deepEqual(chapters, [
      {
        chapter_number: 1,
        title: '旧第一章',
        content_file_path: 'legacy/1.json',
        content_preview: '旧预览',
      },
    ]);
  } finally {
    db.close();
  }
});

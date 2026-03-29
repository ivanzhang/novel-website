const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../auth');
const { fetchBook, fetchChapter, buildCoverUrl } = require('../apibi-client');
const { getNovelById, getChapterList, getCategories } = require('../book-index');

router.get('/novels', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const sort = req.query.sort === 'newest' ? 'newest' : 'popular';

  const countResult = db.prepare(`
    SELECT COUNT(*) as count FROM novels
    ${category ? 'WHERE primary_category = ?' : ''}
  `).get(...(category ? [category] : []));

  const novels = db.prepare(`
    SELECT id, title, author, is_premium, chapter_count, description, 
           free_chapters, created_at, primary_category, source_category, cover_url
    FROM novels
    ${category ? 'WHERE primary_category = ?' : ''}
    ORDER BY id ${sort === 'newest' ? 'DESC' : 'ASC'}
    LIMIT ? OFFSET ?
  `).all(...(category ? [category] : []), limit, offset);

  res.json({
    novels: novels.map(n => ({
      ...n,
      cover_url: n.cover_url || buildCoverUrl(n.id)
    })),
    total: countResult.count,
    page,
    limit,
    category: category || null,
    sort
  });
});

router.get('/novel-categories', (req, res) => {
  const localCategories = db.prepare(`
    SELECT primary_category, COUNT(*) as count
    FROM novels
    WHERE primary_category IS NOT NULL AND TRIM(primary_category) != ''
    GROUP BY primary_category
    ORDER BY count DESC
  `).all().map(row => ({
    category: row.primary_category,
    count: row.count
  }));

  if (localCategories.length > 0) {
    return res.json(localCategories);
  }

  const indexCategories = getCategories();
  res.json(indexCategories);
});

router.get('/novels/:id', async (req, res) => {
  const novelId = parseInt(req.params.id);
  
  let novel = db.prepare(`
    SELECT id, title, author, is_premium, chapter_count, description,
           free_chapters, created_at, primary_category, source_category, cover_url
    FROM novels WHERE id = ?
  `).get(novelId);

  if (!novel) {
    const localBook = getNovelById(novelId);
    if (localBook) {
      novel = {
        id: localBook.id,
        title: localBook.title,
        author: localBook.author,
        is_premium: 0,
        chapter_count: localBook.chapterCount,
        description: localBook.description,
        free_chapters: 0,
        primary_category: localBook.category,
        cover_url: localBook.cover_url
      };
    }
  }

  if (!novel) {
    const apiResult = await fetchBook(novelId);
    if (apiResult.success) {
      novel = {
        id: apiResult.data.id,
        title: apiResult.data.title,
        author: apiResult.data.author,
        is_premium: 0,
        chapter_count: apiResult.data.chapterCount,
        description: apiResult.data.description,
        free_chapters: 0,
        primary_category: apiResult.data.category,
        cover_url: buildCoverUrl(novelId)
      };
    }
  }

  if (!novel) {
    return res.status(404).json({ error: '小说不存在' });
  }

  res.json({
    ...novel,
    cover_url: novel.cover_url || buildCoverUrl(novelId)
  });
});

router.get('/novels/:id/chapter-preview', async (req, res) => {
  const novelId = parseInt(req.params.id);
  const limit = Math.min(12, Math.max(3, parseInt(req.query.limit, 10) || 6));

  let chapters = getChapterList(novelId);
  
  if (chapters.length === 0) {
    const localBook = getNovelById(novelId);
    if (localBook && localBook.chapters) {
      chapters = localBook.chapters.slice(0, limit).map(ch => ({
        chapter_number: ch.chapterNumber,
        title: ch.title,
        chapterId: ch.chapterId || ch.chapterNumber
      }));
    }
  }

  if (chapters.length === 0) {
    const apiResult = await fetchBook(novelId);
    if (apiResult.success) {
      const preview = [];
      for (let i = 1; i <= Math.min(limit, apiResult.data.chapterCount); i++) {
        preview.push({
          chapter_number: i,
          title: `第${i}章`,
          chapterId: i
        });
      }
      return res.json({
        novel_id: novelId,
        chapter_count: apiResult.data.chapterCount,
        preview
      });
    }
  }

  const preview = chapters.slice(0, limit).map(ch => ({
    chapter_number: ch.chapter_number,
    title: ch.title,
    chapterId: ch.chapterId
  }));

  res.json({
    novel_id: novelId,
    chapter_count: chapters.length || preview.length,
    preview
  });
});

router.get('/novels/:id/recommendations', async (req, res) => {
  const novelId = parseInt(req.params.id);
  
  let category = null;
  
  const novel = db.prepare('SELECT primary_category FROM novels WHERE id = ?').get(novelId);
  if (novel && novel.primary_category) {
    category = novel.primary_category;
  } else {
    const localBook = getNovelById(novelId);
    if (localBook && localBook.category) {
      category = localBook.category;
    }
  }

  if (!category) {
    return res.json({ novel_id: novelId, recommendations: [] });
  }

  const recommendations = db.prepare(`
    SELECT id, title, author, is_premium, chapter_count, description,
           free_chapters, primary_category, cover_url
    FROM novels
    WHERE id != ? AND primary_category = ?
    ORDER BY id DESC
    LIMIT 6
  `).all(novelId, category);

  res.json({
    novel_id: novelId,
    recommendations: recommendations.map(n => ({
      ...n,
      cover_url: n.cover_url || buildCoverUrl(n.id)
    }))
  });
});

router.get('/novels/:novelId/chapters', authenticateToken, async (req, res) => {
  const novelId = parseInt(req.params.novelId);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 100));
  const offset = (page - 1) * limit;

  let chapters = getChapterList(novelId);
  
  if (chapters.length === 0) {
    const apiResult = await fetchBook(novelId);
    if (apiResult.success) {
      chapters = [];
      for (let i = 1; i <= apiResult.data.chapterCount; i++) {
        chapters.push({
          chapter_number: i,
          title: `第${i}章`,
          chapterId: i
        });
      }
    }
  }

  if (chapters.length === 0) {
    return res.json({ chapters: [], total: 0, page, limit });
  }

  const total = chapters.length;
  const paginated = chapters.slice(offset, offset + limit).map(chapter => ({
    chapter_number: chapter.chapter_number,
    title: chapter.title,
    chapterId: chapter.chapterId,
    needs_premium: false
  }));

  res.json({ chapters: paginated, total, page, limit });
});

router.get('/novels/:novelId/chapters/:chapterNumber', authenticateToken, async (req, res) => {
  const novelId = parseInt(req.params.novelId);
  const chapterNumber = parseInt(req.params.chapterNumber);

  const apiResult = await fetchChapter(novelId, chapterNumber);

  if (!apiResult.success) {
    return res.status(404).json({ error: '章节不存在或加载失败' });
  }

  const data = apiResult.data;
  
  let novelTitle = null;
  let author = data.author;

  const novel = db.prepare('SELECT title, author FROM novels WHERE id = ?').get(novelId);
  if (novel) {
    novelTitle = novel.title;
    author = novel.author;
  } else {
    const localBook = getNovelById(novelId);
    if (localBook) {
      novelTitle = localBook.title;
      author = localBook.author;
    }
  }

  res.json({
    id: data.chapterId,
    novel_id: novelId,
    chapter_number: chapterNumber,
    title: data.chapterName || `第${chapterNumber}章`,
    content: data.content,
    word_count: data.content.length,
    novel_title: novelTitle,
    author: author
  });
});

router.get('/chapters/:chapterId', authenticateToken, async (req, res) => {
  const chapterId = parseInt(req.params.chapterId);
  
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId);

  if (chapter) {
    return res.json(chapter);
  }

  res.status(404).json({ error: '章节不存在' });
});

router.get('/search', (req, res) => {
  let { q } = req.query;
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';

  if (!q || q.trim().length === 0) {
    return res.json([]);
  }

  if (q.length > 100) {
    return res.status(400).json({ error: '搜索内容不能超过100字符' });
  }

  const searchTerm = q.trim().replace(/[^\w\u4e00-\u9fa5]/g, ' ').trim();
  if (!searchTerm) {
    return res.json([]);
  }

  const limit = 20;
  let ftsResults = [];

  try {
    const ftsQuery = `"${searchTerm.replace(/"/g, '""')}" OR "${searchTerm.replace(/"/g, '""')}*"`;
    ftsResults = db.prepare(`
      SELECT n.id, n.title, n.author, n.is_premium, n.chapter_count, n.description,
             n.free_chapters, n.primary_category, n.cover_url
      FROM novels n
      INNER JOIN novels_fts fts ON n.id = fts.id
      WHERE novels_fts MATCH ?
      ${category ? 'AND n.primary_category = ?' : ''}
      LIMIT ?
    `).all(...(category ? [ftsQuery, category, limit] : [ftsQuery, limit]));
  } catch (ftsError) {
    ftsResults = [];
  }

  if (ftsResults.length < limit) {
    const likePattern = `%${searchTerm}%`;
    const dbResults = db.prepare(`
      SELECT id, title, author, is_premium, chapter_count, description,
             free_chapters, primary_category, cover_url
      FROM novels
      WHERE (title LIKE ? OR author LIKE ?)
      ${category ? 'AND primary_category = ?' : ''}
      ${ftsResults.length > 0 ? 'AND id NOT IN (' + ftsResults.map(() => '?').join(',') + ')' : ''}
      ORDER BY id DESC
      LIMIT ?
    `).all(
      likePattern,
      likePattern,
      ...(category ? [category] : []),
      ...(ftsResults.length > 0 ? ftsResults.map(r => r.id) : []),
      limit - ftsResults.length
    );
    ftsResults.push(...dbResults);
  }

  res.json(ftsResults.slice(0, limit).map(n => ({
    ...n,
    cover_url: n.cover_url || buildCoverUrl(n.id)
  })));
});

module.exports = router;

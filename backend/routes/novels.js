const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../auth');
const { checkPremiumAccess, isActiveMember } = require('../helpers');
const { loadChapterContent } = require('../chapter-content');
const { normalizeNovelSort, buildNovelOrderClause, buildSearchOrderClause } = require('../novel-sort');

// 获取小说列表（公开）
router.get('/novels', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const sort = normalizeNovelSort(req.query.sort);
  const whereClause = category ? 'WHERE primary_category = ?' : '';
  const queryParams = category ? [category] : [];

  const total = db.prepare(`
    SELECT COUNT(*) as count
    FROM novels
    ${whereClause}
  `).get(...queryParams).count;
  const novels = db.prepare(`
    SELECT
      id,
      title,
      author,
      is_premium,
      chapter_count,
      description,
      free_chapters,
      created_at,
      primary_category,
      source_category,
      cover_url
    FROM novels
    ${whereClause}
    ORDER BY ${buildNovelOrderClause(sort)}
    LIMIT ? OFFSET ?
  `).all(...queryParams, limit, offset);
  res.json({ novels, total, page, limit, category: category || null, sort });
});

router.get('/novel-categories', (req, res) => {
  const categories = db.prepare(`
    SELECT primary_category, COUNT(*) as count
    FROM novels
    WHERE primary_category IS NOT NULL AND TRIM(primary_category) != ''
    GROUP BY primary_category
    ORDER BY count DESC, primary_category ASC
  `).all().map((row) => ({
    category: row.primary_category,
    count: row.count,
  }));

  res.json(categories);
});

// 获取小说详情（公开）
router.get('/novels/:id', (req, res) => {
  const novel = db.prepare(`
    SELECT
      id,
      title,
      author,
      is_premium,
      chapter_count,
      description,
      free_chapters,
      created_at,
      primary_category,
      source_category,
      cover_url
    FROM novels
    WHERE id = ?
  `).get(req.params.id);

  if (!novel) {
    return res.status(404).json({ error: '小说不存在' });
  }

  res.json(novel);
});

// 获取小说的章节列表（需登录）
router.get('/novels/:novelId/chapters', authenticateToken, (req, res) => {
  const novel = db.prepare('SELECT is_premium, free_chapters FROM novels WHERE id = ?').get(req.params.novelId);

  if (!novel) {
    return res.status(404).json({ error: '小说不存在' });
  }

  const chapters = db.prepare('SELECT id, chapter_number, title, is_premium, word_count, created_at FROM chapters WHERE novel_id = ? ORDER BY chapter_number').all(req.params.novelId);

  const chaptersWithStatus = chapters.map(chapter => ({
    ...chapter,
    needs_premium: checkPremiumAccess(chapter, novel)
  }));

  res.json(chaptersWithStatus);
});

// 获取指定章节内容（需登录）
router.get('/novels/:novelId/chapters/:chapterNumber', authenticateToken, async (req, res, next) => {
  const chapter = db.prepare('SELECT * FROM chapters WHERE novel_id = ? AND chapter_number = ?').get(req.params.novelId, req.params.chapterNumber);

  if (!chapter) {
    return res.status(404).json({ error: '章节不存在' });
  }

  const user = db.prepare('SELECT is_member, member_expire FROM users WHERE id = ?').get(req.user.id);
  const novel = db.prepare('SELECT is_premium, free_chapters FROM novels WHERE id = ?').get(req.params.novelId);

  if (!novel) {
    return res.status(404).json({ error: '小说不存在' });
  }

  if (checkPremiumAccess(chapter, novel) && !isActiveMember(user)) {
    return res.status(403).json({ error: '需要会员才能阅读此章节' });
  }

  try {
    const chapterWithContent = await loadChapterContent(chapter);
    res.json(chapterWithContent);
  } catch (error) {
    if (error.message === '正文文件不存在' || error.message === '正文文件路径非法') {
      return res.status(404).json({ error: error.message });
    }

    next(error);
  }
});

// 通过章节ID获取内容（需登录）
router.get('/chapters/:chapterId', authenticateToken, async (req, res, next) => {
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.chapterId);

  if (!chapter) {
    return res.status(404).json({ error: '章节不存在' });
  }

  const user = db.prepare('SELECT is_member, member_expire FROM users WHERE id = ?').get(req.user.id);
  const novel = db.prepare('SELECT is_premium, free_chapters FROM novels WHERE id = ?').get(chapter.novel_id);

  if (!novel) {
    return res.status(404).json({ error: '小说不存在' });
  }

  if (checkPremiumAccess(chapter, novel) && !isActiveMember(user)) {
    return res.status(403).json({ error: '需要会员才能阅读此章节' });
  }

  try {
    const chapterWithContent = await loadChapterContent(chapter);
    res.json(chapterWithContent);
  } catch (error) {
    if (error.message === '正文文件不存在' || error.message === '正文文件路径非法') {
      return res.status(404).json({ error: error.message });
    }

    next(error);
  }
});

// 搜索小说（公开）
router.get('/search', (req, res) => {
  let { q } = req.query;
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const sort = normalizeNovelSort(req.query.sort);

  if (!q || q.trim().length === 0) {
    return res.json([]);
  }

  if (q.length > 100) {
    return res.status(400).json({ error: '搜索内容不能超过100字符' });
  }

  const searchTerm = `%${q.trim()}%`;
  const categoryClause = category ? 'AND primary_category = ?' : '';
  const params = category
    ? [searchTerm, searchTerm, category, q + '%', q + '%']
    : [searchTerm, searchTerm, q + '%', q + '%'];
  const novels = db.prepare(`
    SELECT
      id,
      title,
      author,
      is_premium,
      chapter_count,
      description,
      free_chapters,
      primary_category,
      source_category,
      cover_url
    FROM novels
    WHERE (title LIKE ? OR author LIKE ?)
      ${categoryClause}
    ORDER BY ${buildSearchOrderClause(sort)}
    LIMIT 20
  `).all(...params);

  res.json(novels);
});

module.exports = router;

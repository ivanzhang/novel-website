const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../auth');
const { checkPremiumAccess, isActiveMember } = require('../helpers');

// 获取小说列表（公开）
router.get('/novels', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM novels').get().count;
  const novels = db.prepare('SELECT id, title, author, is_premium, chapter_count, description, free_chapters, created_at FROM novels LIMIT ? OFFSET ?').all(limit, offset);
  res.json({ novels, total, page, limit });
});

// 获取小说详情（公开）
router.get('/novels/:id', (req, res) => {
  const novel = db.prepare('SELECT id, title, author, is_premium, chapter_count, description, free_chapters, created_at FROM novels WHERE id = ?').get(req.params.id);

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
router.get('/novels/:novelId/chapters/:chapterNumber', authenticateToken, (req, res) => {
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

  res.json(chapter);
});

// 通过章节ID获取内容（需登录）
router.get('/chapters/:chapterId', authenticateToken, (req, res) => {
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

  res.json(chapter);
});

// 搜索小说（公开）
router.get('/search', (req, res) => {
  let { q } = req.query;

  if (!q || q.trim().length === 0) {
    return res.json([]);
  }

  if (q.length > 100) {
    return res.status(400).json({ error: '搜索内容不能超过100字符' });
  }

  const searchTerm = `%${q.trim()}%`;
  const novels = db.prepare(`
    SELECT id, title, author, is_premium, chapter_count, description, free_chapters
    FROM novels
    WHERE title LIKE ? OR author LIKE ?
    ORDER BY
      CASE
        WHEN title LIKE ? THEN 1
        WHEN author LIKE ? THEN 2
        ELSE 3
      END,
      created_at DESC
    LIMIT 20
  `).all(searchTerm, searchTerm, q + '%', q + '%');

  res.json(novels);
});

module.exports = router;

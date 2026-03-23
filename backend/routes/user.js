const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../auth');

function buildMemberProfile(user = {}) {
  const expireDate = user.member_expire ? new Date(user.member_expire) : null;
  const now = new Date();
  const activeMember = Boolean(user.is_member && expireDate && expireDate.getTime() > now.getTime());
  const daysRemaining = activeMember
    ? Math.max(0, Math.ceil((expireDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  return {
    id: user.id,
    username: user.username,
    is_member: user.is_member,
    member_expire: user.member_expire,
    member_level: activeMember ? '黄金会员' : '普通用户',
    days_remaining: daysRemaining,
    status_text: activeMember ? `会员有效中，剩余 ${daysRemaining} 天` : '当前为普通用户，可开通会员解锁 VIP 章节',
  };
}

function buildMembershipPlans() {
  return [
    { id: 'monthly', title: '月度会员', months: 1, price: 30, tagline: '适合短期追更，立刻解锁全部 VIP 章节', recommended: false },
    { id: 'quarterly', title: '季度会员', months: 3, price: 80, tagline: '性价比更高，适合稳定阅读', recommended: true },
    { id: 'yearly', title: '年度会员', months: 12, price: 288, tagline: '全年畅读，续费频率最低', recommended: false },
  ];
}

function buildMembershipBenefits() {
  return [
    { id: 'vip-access', title: '解锁 VIP 章节', description: '开通后可直接阅读站内会员章节。' },
    { id: 'history-sync', title: '阅读进度同步', description: '自动保存阅读记录，回来继续读。' },
    { id: 'bookshelf', title: '书签与收藏管理', description: '保留阅读位置和重点章节，追更更省心。' },
    { id: 'new-features', title: '优先体验新能力', description: '后续会员体验优化会优先面向会员开放。' },
  ];
}

// 获取用户对指定小说的阅读进度
router.get('/reading-progress/:novelId', authenticateToken, (req, res) => {
  const progress = db.prepare(`
    SELECT rp.*, c.chapter_number, c.title as chapter_title
    FROM reading_progress rp
    JOIN chapters c ON rp.chapter_id = c.id
    WHERE rp.user_id = ? AND rp.novel_id = ?
  `).get(req.user.id, req.params.novelId);

  res.json(progress || null);
});

// 保存/更新阅读进度
router.post('/reading-progress', authenticateToken, (req, res) => {
  const { novel_id, chapter_id, scroll_position, reading_time } = req.body;

  try {
    const stmt = db.prepare(`
      INSERT INTO reading_progress (user_id, novel_id, chapter_id, scroll_position, reading_time, last_read_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, novel_id)
      DO UPDATE SET
        chapter_id = ?,
        scroll_position = ?,
        reading_time = reading_time + ?,
        last_read_at = CURRENT_TIMESTAMP
    `);
    stmt.run(
      req.user.id, novel_id, chapter_id, scroll_position, reading_time || 0,
      chapter_id, scroll_position, reading_time || 0
    );
    res.json({ message: '进度已保存' });
  } catch (error) {
    res.status(500).json({ error: '保存进度失败' });
  }
});

// 获取用户所有阅读进度（用于"继续阅读"）
router.get('/reading-progress', authenticateToken, (req, res) => {
  const progressList = db.prepare(`
    SELECT rp.*, n.title as novel_title, n.author, n.chapter_count, c.chapter_number, c.title as chapter_title
    FROM reading_progress rp
    JOIN novels n ON rp.novel_id = n.id
    JOIN chapters c ON rp.chapter_id = c.id
    WHERE rp.user_id = ?
    ORDER BY rp.last_read_at DESC
    LIMIT 20
  `).all(req.user.id);

  res.json(progressList);
});

// 获取用户总阅读时长
router.get('/reading-stats', authenticateToken, (req, res) => {
  const stats = db.prepare(`
    SELECT
      SUM(reading_time) as total_time,
      COUNT(DISTINCT novel_id) as novels_read,
      COUNT(*) as total_sessions
    FROM reading_progress
    WHERE user_id = ?
  `).get(req.user.id);

  res.json(stats || { total_time: 0, novels_read: 0, total_sessions: 0 });
});

router.get('/member-center', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, is_member, member_expire FROM users WHERE id = ?').get(req.user.id);
  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(reading_time), 0) as total_time,
      COUNT(DISTINCT novel_id) as novels_read,
      COUNT(*) as total_sessions
    FROM reading_progress
    WHERE user_id = ?
  `).get(req.user.id);
  const recentReads = db.prepare(`
    SELECT
      rp.novel_id,
      rp.chapter_id,
      rp.last_read_at,
      n.title as novel_title,
      n.author,
      n.cover_url,
      c.chapter_number,
      c.title as chapter_title
    FROM reading_progress rp
    JOIN novels n ON rp.novel_id = n.id
    JOIN chapters c ON rp.chapter_id = c.id
    WHERE rp.user_id = ?
    ORDER BY rp.last_read_at DESC
    LIMIT 5
  `).all(req.user.id);

  res.json({
    profile: {
      ...buildMemberProfile(user),
      benefit_count: buildMembershipBenefits().length,
    },
    stats: stats || { total_time: 0, novels_read: 0, total_sessions: 0 },
    recent_reads: recentReads,
    plans: buildMembershipPlans(),
    benefits: buildMembershipBenefits(),
  });
});

// ========== 书签功能 ==========

router.post('/bookmarks', authenticateToken, (req, res) => {
  const { novel_id, chapter_id, chapter_number, note } = req.body;

  if (note && note.length > 200) {
    return res.status(400).json({ error: '书签备注不能超过200字符' });
  }

  try {
    const stmt = db.prepare('INSERT INTO bookmarks (user_id, novel_id, chapter_id, chapter_number, note) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(req.user.id, novel_id, chapter_id, chapter_number, note || '');
    res.json({ message: '书签已添加', bookmarkId: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: '添加书签失败' });
  }
});

router.get('/bookmarks', authenticateToken, (req, res) => {
  const { novel_id } = req.query;

  let query = `
    SELECT b.*, n.title as novel_title, c.title as chapter_title
    FROM bookmarks b
    JOIN novels n ON b.novel_id = n.id
    JOIN chapters c ON b.chapter_id = c.id
    WHERE b.user_id = ?
  `;
  const params = [req.user.id];

  if (novel_id) {
    query += ' AND b.novel_id = ?';
    params.push(novel_id);
  }

  query += ' ORDER BY b.created_at DESC';

  const bookmarks = db.prepare(query).all(...params);
  res.json(bookmarks);
});

router.delete('/bookmarks/:id', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM bookmarks WHERE id = ? AND user_id = ?');
    const result = stmt.run(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: '书签不存在' });
    }
    res.json({ message: '书签已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除书签失败' });
  }
});

// ========== 评论功能 ==========

router.post('/comments', authenticateToken, (req, res) => {
  const { chapter_id, content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: '评论内容不能为空' });
  }

  if (content.length > 1000) {
    return res.status(400).json({ error: '评论内容不能超过1000字符' });
  }

  try {
    const stmt = db.prepare('INSERT INTO comments (user_id, chapter_id, content) VALUES (?, ?, ?)');
    const result = stmt.run(req.user.id, chapter_id, content.trim());
    res.json({ message: '评论已发表', commentId: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: '发表评论失败' });
  }
});

router.get('/comments/:chapterId', (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.username
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.chapter_id = ?
    ORDER BY c.created_at DESC
  `).all(req.params.chapterId);

  res.json(comments);
});

router.delete('/comments/:id', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM comments WHERE id = ? AND user_id = ?');
    const result = stmt.run(req.params.id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: '评论不存在' });
    }
    res.json({ message: '评论已删除' });
  } catch (error) {
    res.status(500).json({ error: '删除评论失败' });
  }
});

// ========== 评分功能 ==========

router.post('/ratings', authenticateToken, (req, res) => {
  const { novel_id, rating } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: '评分必须在1-5之间' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO ratings (user_id, novel_id, rating)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, novel_id)
      DO UPDATE SET rating = ?, created_at = CURRENT_TIMESTAMP
    `);
    stmt.run(req.user.id, novel_id, rating, rating);
    res.json({ message: '评分已提交' });
  } catch (error) {
    res.status(500).json({ error: '提交评分失败' });
  }
});

router.get('/ratings/:novelId', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as count,
      AVG(rating) as average,
      SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
      SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
      SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
      SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
    FROM ratings
    WHERE novel_id = ?
  `).get(req.params.novelId);

  res.json(stats);
});

router.get('/ratings/:novelId/user', authenticateToken, (req, res) => {
  const rating = db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND novel_id = ?').get(req.user.id, req.params.novelId);
  res.json(rating || { rating: 0 });
});

// ========== 会员购买 ==========

router.post('/purchase-membership', authenticateToken, (req, res) => {
  const { months } = req.body;
  const amount = months * 30;

  const stmt = db.prepare('INSERT INTO orders (user_id, amount, status) VALUES (?, ?, ?)');
  const order = stmt.run(req.user.id, amount, 'completed');

  const user = db.prepare('SELECT is_member, member_expire FROM users WHERE id = ?').get(req.user.id);
  const now = new Date();
  const baseDate = (user.is_member && user.member_expire && new Date(user.member_expire) > now)
    ? new Date(user.member_expire)
    : now;
  const expireDate = new Date(baseDate.getTime() + months * 30 * 24 * 60 * 60 * 1000);

  db.prepare('UPDATE users SET is_member = 1, member_expire = ? WHERE id = ?')
    .run(expireDate.toISOString(), req.user.id);

  res.json({ message: '购买成功', orderId: order.lastInsertRowid, expireDate });
});

// 获取用户信息
router.get('/user/profile', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, is_member, member_expire FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

module.exports = router;

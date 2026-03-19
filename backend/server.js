const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const db = require('./db');
const { authenticateToken, generateToken } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

// 用户注册
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 20) {
    return res.status(400).json({ error: '用户名需要3-20个字符' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: '密码至少需要6个字符' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    const result = stmt.run(username.trim(), hashedPassword);
    res.json({ message: '注册成功', userId: result.lastInsertRowid });
  } catch (error) {
    res.status(400).json({ error: '用户名已存在' });
  }
});

// 用户登录
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username, is_member: user.is_member } });
});

// 获取小说列表
app.get('/api/novels', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM novels').get().count;
  const novels = db.prepare('SELECT id, title, author, is_premium, chapter_count, description, free_chapters, created_at FROM novels LIMIT ? OFFSET ?').all(limit, offset);
  res.json({ novels, total, page, limit });
});

// 获取小说详情（不含章节内容）
app.get('/api/novels/:id', authenticateToken, (req, res) => {
  const novel = db.prepare('SELECT id, title, author, is_premium, chapter_count, description, free_chapters, created_at FROM novels WHERE id = ?').get(req.params.id);

  if (!novel) {
    return res.status(404).json({ error: '小说不存在' });
  }

  res.json(novel);
});

// 获取小说的章节列表（仅元数据）
app.get('/api/novels/:novelId/chapters', authenticateToken, (req, res) => {
  const chapters = db.prepare('SELECT id, chapter_number, title, is_premium, word_count, created_at FROM chapters WHERE novel_id = ? ORDER BY chapter_number').all(req.params.novelId);
  const novel = db.prepare('SELECT is_premium, free_chapters FROM novels WHERE id = ?').get(req.params.novelId);

  // 为每个章节添加实际的付费状态
  const chaptersWithStatus = chapters.map(chapter => {
    let needsPremium = false;
    if (chapter.is_premium) {
      needsPremium = true;
    } else if (novel.is_premium && novel.free_chapters > 0) {
      // 如果小说是VIP，但有免费章节，检查章节号
      needsPremium = chapter.chapter_number > novel.free_chapters;
    } else if (novel.is_premium) {
      needsPremium = true;
    }
    return { ...chapter, needs_premium: needsPremium };
  });

  res.json(chaptersWithStatus);
});

// 获取指定章节内容
app.get('/api/novels/:novelId/chapters/:chapterNumber', authenticateToken, (req, res) => {
  const chapter = db.prepare('SELECT * FROM chapters WHERE novel_id = ? AND chapter_number = ?').get(req.params.novelId, req.params.chapterNumber);

  if (!chapter) {
    return res.status(404).json({ error: '章节不存在' });
  }

  const user = db.prepare('SELECT is_member, member_expire FROM users WHERE id = ?').get(req.user.id);
  const novel = db.prepare('SELECT is_premium, free_chapters FROM novels WHERE id = ?').get(req.params.novelId);

  // 检查权限：
  // 1. 章节级 is_premium 优先
  // 2. 如果小说是VIP且有免费章节，检查章节号
  // 3. 否则使用小说级 is_premium
  let needsPremium = false;
  if (chapter.is_premium) {
    needsPremium = true;
  } else if (novel.is_premium && novel.free_chapters > 0) {
    needsPremium = chapter.chapter_number > novel.free_chapters;
  } else if (novel.is_premium) {
    needsPremium = true;
  }

  if (needsPremium && (!user.is_member || new Date(user.member_expire) < new Date())) {
    return res.status(403).json({ error: '需要会员才能阅读此章节' });
  }

  res.json(chapter);
});

// 通过章节ID获取内容
app.get('/api/chapters/:chapterId', authenticateToken, (req, res) => {
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(req.params.chapterId);

  if (!chapter) {
    return res.status(404).json({ error: '章节不存在' });
  }

  const user = db.prepare('SELECT is_member, member_expire FROM users WHERE id = ?').get(req.user.id);
  const novel = db.prepare('SELECT is_premium, free_chapters FROM novels WHERE id = ?').get(chapter.novel_id);

  // 使用相同的权限检查逻辑
  let needsPremium = false;
  if (chapter.is_premium) {
    needsPremium = true;
  } else if (novel.is_premium && novel.free_chapters > 0) {
    needsPremium = chapter.chapter_number > novel.free_chapters;
  } else if (novel.is_premium) {
    needsPremium = true;
  }

  if (needsPremium && (!user.is_member || new Date(user.member_expire) < new Date())) {
    return res.status(403).json({ error: '需要会员才能阅读此章节' });
  }

  res.json(chapter);
});

// 获取用户对指定小说的阅读进度
app.get('/api/reading-progress/:novelId', authenticateToken, (req, res) => {
  const progress = db.prepare(`
    SELECT rp.*, c.chapter_number, c.title as chapter_title
    FROM reading_progress rp
    JOIN chapters c ON rp.chapter_id = c.id
    WHERE rp.user_id = ? AND rp.novel_id = ?
  `).get(req.user.id, req.params.novelId);

  res.json(progress || null);
});

// 保存/更新阅读进度
app.post('/api/reading-progress', authenticateToken, (req, res) => {
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
app.get('/api/reading-progress', authenticateToken, (req, res) => {
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
app.get('/api/reading-stats', authenticateToken, (req, res) => {
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

// ========== 书签功能 ==========

// 添加书签
app.post('/api/bookmarks', authenticateToken, (req, res) => {
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

// 获取用户的书签列表
app.get('/api/bookmarks', authenticateToken, (req, res) => {
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

// 删除书签
app.delete('/api/bookmarks/:id', authenticateToken, (req, res) => {
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

// 发表评论
app.post('/api/comments', authenticateToken, (req, res) => {
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

// 获取章节评论
app.get('/api/comments/:chapterId', (req, res) => {
  const comments = db.prepare(`
    SELECT c.*, u.username
    FROM comments c
    JOIN users u ON c.user_id = u.id
    WHERE c.chapter_id = ?
    ORDER BY c.created_at DESC
  `).all(req.params.chapterId);

  res.json(comments);
});

// 删除评论
app.delete('/api/comments/:id', authenticateToken, (req, res) => {
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

// 提交评分
app.post('/api/ratings', authenticateToken, (req, res) => {
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

// 获取小说评分
app.get('/api/ratings/:novelId', (req, res) => {
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

// 获取用户对小说的评分
app.get('/api/ratings/:novelId/user', authenticateToken, (req, res) => {
  const rating = db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND novel_id = ?').get(req.user.id, req.params.novelId);
  res.json(rating || { rating: 0 });
});

// ========== 搜索功能 ==========

// 搜索小说
app.get('/api/search', (req, res) => {
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

// 购买会员
app.post('/api/purchase-membership', authenticateToken, (req, res) => {
  const { months } = req.body;
  const amount = months * 30; // 30元/月

  // 创建订单
  const stmt = db.prepare('INSERT INTO orders (user_id, amount, status) VALUES (?, ?, ?)');
  const order = stmt.run(req.user.id, amount, 'completed');

  // 更新会员状态
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
app.get('/api/user/profile', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, username, is_member, member_expire FROM users WHERE id = ?').get(req.user.id);
  res.json(user);
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

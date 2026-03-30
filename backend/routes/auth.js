const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken } = require('../auth');

// 随机中文用户名生成
const NAME_PREFIXES = ['云', '风', '星', '月', '山', '海', '天', '雨', '雪', '霜', '晨', '夜', '光', '影', '墨', '竹', '松', '梅', '兰', '荷'];
const NAME_SUFFIXES = ['读者', '书客', '追更', '书虫', '墨客', '看官', '书友', '阅者'];

function generateUsername() {
  const prefix = NAME_PREFIXES[Math.floor(Math.random() * NAME_PREFIXES.length)];
  const suffix = NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)];
  return prefix + suffix;
}

// 用户注册（自动分配用户名，无需邮箱）
router.post('/register', async (req, res) => {
  const { password } = req.body;

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: '密码至少需要6个字符' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  // 自动生成不重复的用户名
  let username;
  let attempts = 0;
  while (attempts < 10) {
    const candidate = generateUsername() + Math.floor(Math.random() * 9000 + 1000);
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(candidate);
    if (!existing) {
      username = candidate;
      break;
    }
    attempts++;
  }

  if (!username) {
    return res.status(500).json({ error: '用户名生成失败，请重试' });
  }

  try {
    const stmt = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)');
    const result = stmt.run(username, hashedPassword);
    res.json({ message: '注册成功', userId: result.lastInsertRowid, username });
  } catch (error) {
    res.status(500).json({ error: '注册失败，请重试' });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = generateToken(user);
  res.json({ token, user: { id: user.id, username: user.username, is_member: user.is_member } });
});

module.exports = router;

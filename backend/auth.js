const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  console.error('错误: 必须设置 JWT_SECRET 环境变量');
  process.exit(1);
}

const SECRET_KEY = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '需要登录' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ error: '登录已过期' });
    }
    req.user = user;
    next();
  });
}

// 可选认证：有 token 就解析，没有也放行
function optionalAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return next();

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (!err) req.user = user;
    next();
  });
}

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '7d' });
}

module.exports = { authenticateToken, optionalAuth, generateToken };

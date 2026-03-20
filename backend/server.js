const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { runSeed } = require('./seed');

// 初始化数据库种子数据
runSeed();

const app = express();

// Trust proxy (nginx)
app.set('trust proxy', 1);

// CORS
const allowedOrigins = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: allowedOrigins === '*' ? true : allowedOrigins.split(','),
  credentials: true
}));

// 请求日志
app.use(morgan('combined'));

// JSON 解析
app.use(express.json());

// 全局速率限制：100 请求 / 15 分钟
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', globalLimiter);

// 认证路由速率限制：10 请求 / 15 分钟
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '登录/注册尝试过于频繁，请15分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 挂载路由
app.use('/api', require('./routes/novels'));
app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/user'));

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('未处理的错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

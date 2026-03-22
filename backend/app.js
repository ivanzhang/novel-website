const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const { runSeed } = require('./seed');

function createApp() {
  runSeed();

  const app = express();

  app.set('trust proxy', 1);

  const allowedOrigins = process.env.CORS_ORIGIN || '*';
  app.use(cors({
    origin: allowedOrigins === '*' ? true : allowedOrigins.split(','),
    credentials: true
  }));

  app.use(morgan('combined'));
  app.use(express.json());

  app.use('/covers', express.static(path.join(__dirname, '../storage/json/biquge/covers')));

  const frontendRoot = path.join(__dirname, '../frontend');
  app.use(express.static(frontendRoot));

  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: '请求过于频繁，请稍后再试' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'GET' || (req.method === 'POST' && req.path === '/reading-progress')
  });
  app.use('/api', globalLimiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: '登录/注册尝试过于频繁，请15分钟后再试' },
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api/login', authLimiter);
  app.use('/api/register', authLimiter);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api', require('./routes/novels'));
  app.use('/api', require('./routes/auth'));
  app.use('/api', require('./routes/user'));

  app.get('/', (req, res) => {
    res.sendFile(path.join(frontendRoot, 'index.html'));
  });

  app.use((err, req, res, next) => {
    console.error('未处理的错误:', err);
    res.status(500).json({ error: '服务器内部错误' });
  });

  return app;
}

module.exports = {
  createApp,
};

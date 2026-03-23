const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const { runSeed } = require('./seed');
const db = require('./db');
const {
  buildBaseUrl,
  renderNovelSeoPage,
  getNovelTemplate,
  getIndexTemplate,
  getCategorySeoData,
  resolveCategoryIntent,
  applyCategoryIntent,
  renderIndexSeoPage,
  buildRobotsTxt,
  buildSitemapXml,
} = require('./seo');

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

  const frontendRoot = path.join(__dirname, '../frontend');

  app.get('/favicon.ico', (req, res) => {
    res.redirect(302, '/favicon.svg');
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain; charset=utf-8').send(buildRobotsTxt(buildBaseUrl(req)));
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = buildBaseUrl(req);
    const categories = db.prepare(`
      SELECT DISTINCT primary_category
      FROM novels
      WHERE primary_category IS NOT NULL AND TRIM(primary_category) != ''
      ORDER BY primary_category ASC
    `).all().map((row) => row.primary_category);
    const novels = db.prepare('SELECT id FROM novels ORDER BY id ASC').all();

    res.type('application/xml; charset=utf-8').send(buildSitemapXml(baseUrl, categories, novels));
  });

  app.get('/novel.html', (req, res, next) => {
    const novelId = parseInt(req.query.id, 10);

    if (!novelId) {
      return res.sendFile(path.join(frontendRoot, 'novel.html'));
    }

    const novel = db.prepare(`
      SELECT
        id,
        title,
        author,
        chapter_count,
        description,
        primary_category,
        source_category,
        cover_url
      FROM novels
      WHERE id = ?
    `).get(novelId);

    if (!novel) {
      return res.status(404).send('小说不存在');
    }

    try {
      const html = renderNovelSeoPage(getNovelTemplate(), novel, buildBaseUrl(req));
      res.type('text/html; charset=utf-8').send(html);
    } catch (error) {
      next(error);
    }
  });

  app.get('/index.html', (req, res) => {
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const intentQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (!category) {
      return res.sendFile(path.join(frontendRoot, 'index.html'));
    }

    const total = db.prepare('SELECT COUNT(*) as count FROM novels WHERE primary_category = ?').get(category).count;
    const seoData = applyCategoryIntent(
      getCategorySeoData(category, total),
      resolveCategoryIntent(category, intentQuery)
    );
    const html = renderIndexSeoPage(
      getIndexTemplate(),
      seoData,
      buildBaseUrl(req)
    );

    res.type('text/html; charset=utf-8').send(html);
  });

  app.use('/covers', express.static(path.join(__dirname, '../storage/json/biquge/covers')));
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
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const intentQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (!category) {
      return res.sendFile(path.join(frontendRoot, 'index.html'));
    }

    const total = db.prepare('SELECT COUNT(*) as count FROM novels WHERE primary_category = ?').get(category).count;
    const seoData = applyCategoryIntent(
      getCategorySeoData(category, total),
      resolveCategoryIntent(category, intentQuery)
    );
    const html = renderIndexSeoPage(
      getIndexTemplate(),
      seoData,
      buildBaseUrl(req)
    );

    res.type('text/html; charset=utf-8').send(html);
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

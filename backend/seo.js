const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_ROOT = path.join(__dirname, '../frontend');
const NOVEL_TEMPLATE_PATH = path.join(FRONTEND_ROOT, 'novel.html');
const INDEX_TEMPLATE_PATH = path.join(FRONTEND_ROOT, 'index.html');

const CATEGORY_COPY = {
  玄幻: {
    title: '玄幻小说在线阅读_热门玄幻小说推荐_中文小说阅读网',
    heading: '玄幻频道热门作品',
    intro: '玄幻频道聚合了站内的热门玄幻作品，适合喜欢热血成长、宗门争锋与大世界设定的读者。',
  },
  都市: {
    title: '都市小说在线阅读_热门都市小说推荐_中文小说阅读网',
    heading: '都市频道热门作品',
    intro: '都市频道更适合喜欢逆袭、日常、神豪与职场节奏的读者，更新和追更都更轻松。',
  },
  历史: {
    title: '历史小说在线阅读_热门历史小说推荐_中文小说阅读网',
    heading: '历史频道热门作品',
    intro: '历史频道汇聚了朝堂权谋、争霸征战与穿越改命题材，适合偏爱历史背景与长线布局的读者。',
  },
  科幻: {
    title: '科幻小说在线阅读_热门科幻小说推荐_中文小说阅读网',
    heading: '科幻频道热门作品',
    intro: '科幻频道覆盖末世、未来、星际和异能设定，适合喜欢设定感与节奏感并重的阅读体验。',
  },
  网游: {
    title: '网游小说在线阅读_热门网游小说推荐_中文小说阅读网',
    heading: '网游频道热门作品',
    intro: '网游频道适合偏爱副本升级、竞技开荒和游戏世界成长线的读者，适合连读追更。',
  },
  女生: {
    title: '女生小说在线阅读_热门女生小说推荐_中文小说阅读网',
    heading: '女生频道热门作品',
    intro: '女生频道聚合了更偏情感、成长与关系推进的作品，适合喜欢细腻叙事和强代入感的读者。',
  },
  同人: {
    title: '同人小说在线阅读_热门同人小说推荐_中文小说阅读网',
    heading: '同人频道热门作品',
    intro: '同人频道面向熟悉经典 IP 与角色关系的读者，适合寻找延展故事和设定再创作内容。',
  },
  武侠: {
    title: '武侠小说在线阅读_热门武侠小说推荐_中文小说阅读网',
    heading: '武侠频道热门作品',
    intro: '武侠频道聚合江湖门派、恩怨侠义与行走天下的故事，适合偏爱传统爽感和人物成长的读者。',
  }
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function buildNovelTitle(novel) {
  return `${novel.title} - ${novel.author} - 在线阅读 - 中文小说阅读网`;
}

function buildNovelDescription(novel) {
  const segments = [
    `${novel.title}`,
    `${novel.author}著`,
    novel.primary_category ? `${novel.primary_category}小说` : '',
    novel.chapter_count ? `共${novel.chapter_count}章` : '',
    novel.description ? String(novel.description).trim().replace(/\s+/g, ' ').slice(0, 80) : '',
    '最新章节在线阅读，尽在中文小说阅读网'
  ].filter(Boolean);

  return segments.join('，');
}

function buildNovelStructuredData(novel, baseUrl, canonicalUrl) {
  const payload = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: novel.title,
    author: {
      '@type': 'Person',
      name: novel.author,
    },
    description: novel.description || `${novel.title}在线阅读`,
    genre: novel.primary_category || novel.source_category || undefined,
    image: novel.cover_url ? `${baseUrl}${novel.cover_url}` : undefined,
    url: canonicalUrl,
  };

  return JSON.stringify(payload);
}

function getIndexTemplate() {
  return fs.readFileSync(INDEX_TEMPLATE_PATH, 'utf8');
}

function getCategorySeoData(category, total) {
  const fallback = {
    title: `${category}小说在线阅读_热门${category}小说推荐_中文小说阅读网`,
    heading: `${category}频道热门作品`,
    intro: `${category}频道汇聚了站内该分类下的热门作品，适合希望快速发现同类小说并持续追更的读者。`,
  };
  const copy = CATEGORY_COPY[category] || fallback;
  const description = `提供${category}小说在线阅读，收录 ${total} 本热门${category}作品，支持最新章节浏览与持续更新，书荒时可在中文小说阅读网发现更多同类小说。`;

  return {
    category,
    total,
    title: copy.title,
    heading: copy.heading,
    intro: copy.intro,
    description,
  };
}

function resolveCategoryIntent(category, query) {
  const raw = typeof query === 'string' ? query.trim() : '';
  if (!raw) return null;

  const normalized = raw.replace(/\s+/g, '');
  const prefix = `${category}小说`;

  if (!normalized.startsWith(prefix)) {
    return null;
  }

  const suffix = normalized.slice(prefix.length);
  const intentMap = {
    推荐: {
      title: `${category}小说推荐_热门${category}小说在线阅读_中文小说阅读网`,
      heading: `${category}小说推荐`,
      description: `精选${category}小说推荐内容，覆盖当前站内更受欢迎的${category}作品，适合书荒时快速找到值得先读的同类小说。`,
    },
    大全: {
      title: `${category}小说大全_热门${category}小说在线阅读_中文小说阅读网`,
      heading: `${category}小说大全`,
      description: `提供${category}小说大全，收录 ${category}分类下的热门作品与持续更新内容，适合书荒时快速筛选同类小说。`,
    },
    在线阅读: {
      title: `${category}小说在线阅读_热门${category}小说大全_中文小说阅读网`,
      heading: `${category}小说在线阅读`,
      description: `提供${category}小说在线阅读入口，覆盖${category}分类下的热门作品与持续更新内容，适合直接开始阅读。`,
    },
    排行榜: {
      title: `${category}小说排行榜_热门${category}小说在线阅读_中文小说阅读网`,
      heading: `${category}小说排行榜`,
      description: `整理当前站内热门${category}小说排行榜内容，适合快速发现高完成度和高热度的同类作品。`,
    },
    热门: {
      title: `热门${category}小说推荐_${category}小说在线阅读_中文小说阅读网`,
      heading: `热门${category}小说`,
      description: `汇总热门${category}小说与持续更新作品，适合优先浏览当前站内热度更高的${category}内容。`,
    },
  };

  return intentMap[suffix] ? { query: raw, suffix, ...intentMap[suffix] } : null;
}

function renderCategoryIntroBlock(data) {
  return `
        <section class="category-intro" id="categoryIntro">
          <p class="category-intro-kicker">分类导读</p>
          <h2 class="category-intro-title">${escapeHtml(data.heading)}</h2>
          <p class="category-intro-copy">${escapeHtml(data.intro)}</p>
          <p class="category-intro-meta">当前分类共 ${escapeHtml(data.total)} 本，适合从热门和高完成度作品开始阅读。</p>
        </section>
  `;
}

function applyCategoryIntent(data, intent) {
  if (!intent) {
    return data;
  }

  return {
    ...data,
    title: intent.title,
    heading: intent.heading,
    description: `${intent.description} 当前收录 ${data.total} 本。`,
    intent_query: intent.query,
  };
}

function renderIndexSeoPage(templateHtml, data, baseUrl) {
  const canonicalUrl = `${baseUrl}/index.html?category=${data.category}`;

  let html = templateHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(data.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(data.description)}">`);

  const seoTags = [
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:title" content="${escapeHtml(data.title)}">`,
    `<meta property="og:description" content="${escapeHtml(data.description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
  ].join('\n  ');

  const bootstrapScript = `<script>window.__CATEGORY_PAGE_DATA__=${JSON.stringify(data)};</script>`;
  html = html.replace('</head>', `  ${seoTags}\n  ${bootstrapScript}\n</head>`);

  if (html.includes('<section class="category-intro" id="categoryIntro"></section>')) {
    html = html.replace('<section class="category-intro" id="categoryIntro"></section>', renderCategoryIntroBlock(data));
  }

  return html;
}

function renderNovelSeoPage(templateHtml, novel, baseUrl) {
  const canonicalUrl = `${baseUrl}/novel.html?id=${novel.id}`;
  const title = buildNovelTitle(novel);
  const description = buildNovelDescription(novel);
  const imageUrl = novel.cover_url ? `${baseUrl}${novel.cover_url}` : '';
  const jsonLd = buildNovelStructuredData(novel, baseUrl, canonicalUrl);

  let html = templateHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(description)}">`);

  const seoTags = [
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`,
    imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}">` : '',
    `<script type="application/ld+json">${jsonLd}</script>`
  ].filter(Boolean).join('\n  ');

  html = html.replace('</head>', `  ${seoTags}\n</head>`);
  return html;
}

function getNovelTemplate() {
  return fs.readFileSync(NOVEL_TEMPLATE_PATH, 'utf8');
}

function buildRobotsTxt(baseUrl) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /login.html',
    'Disallow: /membership.html',
    'Disallow: /reader.html',
    'Disallow: /history.html',
    'Disallow: /api/',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    ''
  ].join('\n');
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemapXml(baseUrl, categories, novels) {
  const urls = [
    `${baseUrl}/`,
    ...categories.map((category) => `${baseUrl}/index.html?category=${category}`),
    ...novels.map((novel) => `${baseUrl}/novel.html?id=${novel.id}`),
  ];

  const items = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
}

module.exports = {
  buildBaseUrl,
  buildNovelTitle,
  buildNovelDescription,
  renderNovelSeoPage,
  getNovelTemplate,
  getIndexTemplate,
  getCategorySeoData,
  resolveCategoryIntent,
  applyCategoryIntent,
  renderIndexSeoPage,
  buildRobotsTxt,
  buildSitemapXml,
};

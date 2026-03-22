const fs = require('node:fs/promises');
const path = require('node:path');
const { sanitizeChapterContent } = require('./chapter-cleaner');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONTENT_ROOT = path.join(PROJECT_ROOT, 'storage/json/biquge');
const CACHE_TTL_MS = 5 * 60 * 1000;
const chapterContentCache = new Map();

function resolveContentRoot(contentRoot = DEFAULT_CONTENT_ROOT) {
  return path.resolve(PROJECT_ROOT, contentRoot);
}

function resolveContentFile(contentFilePath, contentRoot = DEFAULT_CONTENT_ROOT) {
  const root = resolveContentRoot(contentRoot);
  const resolved = path.resolve(root, contentFilePath || '');
  const relative = path.relative(root, resolved);

  if (!contentFilePath || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('正文文件路径非法');
  }

  return resolved;
}

async function readChapterJson(contentFilePath, contentRoot = DEFAULT_CONTENT_ROOT) {
  const cacheKey = `${resolveContentRoot(contentRoot)}::${contentFilePath}`;
  const now = Date.now();
  const cached = chapterContentCache.get(cacheKey);

  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.payload;
  }

  const filePath = resolveContentFile(contentFilePath, contentRoot);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const payload = JSON.parse(raw);
    chapterContentCache.set(cacheKey, {
      cachedAt: now,
      payload,
    });
    return payload;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error('正文文件不存在');
    }

    throw error;
  }
}

async function loadChapterContent(chapter = {}, contentRoot = DEFAULT_CONTENT_ROOT) {
  if (chapter.content_file_path) {
    const chapterJson = await readChapterJson(chapter.content_file_path, contentRoot);

    return {
      ...chapter,
      content: chapterJson && typeof chapterJson.content === 'string'
        ? sanitizeChapterContent(chapterJson.content)
        : '',
    };
  }

  return {
    ...chapter,
    content: sanitizeChapterContent(chapter.content || ''),
  };
}

function clearChapterContentCache() {
  chapterContentCache.clear();
}

module.exports = {
  DEFAULT_CONTENT_ROOT,
  CACHE_TTL_MS,
  resolveContentRoot,
  resolveContentFile,
  readChapterJson,
  loadChapterContent,
  clearChapterContentCache,
};

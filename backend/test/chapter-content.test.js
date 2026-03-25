const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

function loadChapterContentModule() {
  const modulePath = path.resolve(__dirname, '../chapter-content.js');
  delete require.cache[modulePath];
  return require('../chapter-content');
}

async function createTempRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'chapter-content-'));
  await fs.mkdir(path.join(root, 'chapters', '2530'), { recursive: true });
  return root;
}

test('loadChapterContent 应该缓存同一正文文件避免重复读取磁盘', async () => {
  const root = await createTempRoot();
  const fsPromises = require('node:fs/promises');
  const originalReadFile = fsPromises.readFile;
  let readCount = 0;

  try {
    await fs.writeFile(
      path.join(root, 'chapters', '2530', '1.json'),
      JSON.stringify({
        content: '缓存正文',
      }, null, 2)
    );

    fsPromises.readFile = async (...args) => {
      readCount += 1;
      return originalReadFile(...args);
    };

    const { loadChapterContent, clearChapterContentCache } = loadChapterContentModule();
    clearChapterContentCache();

    const chapter = {
      id: 10,
      novel_id: 99,
      chapter_number: 1,
      title: '第1章',
      content: '',
      content_file_path: 'chapters/2530/1.json',
    };

    const first = await loadChapterContent(chapter, root);
    const second = await loadChapterContent(chapter, root);

    assert.equal(first.content, '缓存正文');
    assert.equal(second.content, '缓存正文');
    assert.equal(readCount, 1);
  } finally {
    fsPromises.readFile = originalReadFile;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('loadChapterContent 应该优先从 content_file_path 读取 JSON 正文', async () => {
  const root = await createTempRoot();

  try {
    await fs.writeFile(
      path.join(root, 'chapters', '2530', '1.json'),
      JSON.stringify({
        content: '第一段\n第二段',
      }, null, 2)
    );

    const { loadChapterContent } = loadChapterContentModule();
    const chapter = await loadChapterContent(
      {
        id: 10,
        novel_id: 99,
        chapter_number: 1,
        title: '第1章',
        content: '',
        content_file_path: 'chapters/2530/1.json',
      },
      root
    );

    assert.equal(chapter.content, '第一段\n第二段');
    assert.equal(chapter.content_file_path, 'chapters/2530/1.json');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('loadChapterContent 应优先读取 content_cdn_url 对应的远程 JSON 正文', async () => {
  const root = await createTempRoot();
  const originalFetch = global.fetch;

  try {
    await fs.writeFile(
      path.join(root, 'chapters', '2530', '1.json'),
      JSON.stringify({
        content: '本地正文',
      }, null, 2)
    );

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: 'CDN 正文',
      }),
    });

    const { loadChapterContent } = loadChapterContentModule();
    const chapter = await loadChapterContent(
      {
        id: 20,
        novel_id: 99,
        chapter_number: 1,
        title: '第1章',
        content: '',
        content_file_path: 'chapters/2530/1.json',
        content_cdn_url: 'https://aixs.us.ci/file/chapter-2530-1.json',
      },
      root
    );

    assert.equal(chapter.content, 'CDN 正文');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('loadChapterContent 在 CDN 读取失败时应回退本地正文文件', async () => {
  const root = await createTempRoot();
  const originalFetch = global.fetch;

  try {
    await fs.writeFile(
      path.join(root, 'chapters', '2530', '1.json'),
      JSON.stringify({
        content: '本地回退正文',
      }, null, 2)
    );

    global.fetch = async () => {
      throw new Error('fetch failed');
    };

    const { loadChapterContent } = loadChapterContentModule();
    const chapter = await loadChapterContent(
      {
        id: 21,
        novel_id: 99,
        chapter_number: 1,
        title: '第1章',
        content: '',
        content_file_path: 'chapters/2530/1.json',
        content_cdn_url: 'https://aixs.us.ci/file/chapter-2530-1.json',
      },
      root
    );

    assert.equal(chapter.content, '本地回退正文');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('loadChapterContent 应在返回前清洗正文中的域名广告', async () => {
  const root = await createTempRoot();

  try {
    await fs.writeFile(
      path.join(root, 'chapters', '2530', '1.json'),
      JSON.stringify({
        content: '第一段正文。\n请收藏最新网址 b i q u g e 。 c o m\n第二段正文。',
      }, null, 2)
    );

    const { loadChapterContent, clearChapterContentCache } = loadChapterContentModule();
    clearChapterContentCache();
    const chapter = await loadChapterContent(
      {
        id: 10,
        novel_id: 99,
        chapter_number: 1,
        title: '第1章',
        content: '',
        content_file_path: 'chapters/2530/1.json',
      },
      root
    );

    assert.equal(chapter.content, '第一段正文。\n第二段正文。');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('loadChapterContent 应该在缺失正文文件时抛出明确错误', async () => {
  const root = await createTempRoot();

  try {
    const { loadChapterContent } = loadChapterContentModule();

    await assert.rejects(
      () => loadChapterContent(
        {
          id: 10,
          novel_id: 99,
          chapter_number: 1,
          title: '第1章',
          content: '',
          content_file_path: 'chapters/2530/404.json',
        },
        root
      ),
      /正文文件不存在/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('loadChapterContent 应该兼容旧的数据库内联正文', async () => {
  const { loadChapterContent } = loadChapterContentModule();
  const chapter = await loadChapterContent({
    id: 1,
    novel_id: 1,
    chapter_number: 1,
    title: '旧章节',
    content: '旧正文',
    content_file_path: null,
  });

  assert.equal(chapter.content, '旧正文');
});

test('resolveContentFile 应拒绝越界路径', async () => {
  const root = await createTempRoot();

  try {
    const { resolveContentFile } = loadChapterContentModule();

    assert.throws(
      () => resolveContentFile('../secrets.json', root),
      /正文文件路径非法/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('首页应包含移动端折叠搜索、折叠继续阅读和分类滚动增强标记', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../frontend/index.html'), 'utf8');

  assert.match(html, /mobileSearchToggle/);
  assert.match(html, /continueReadingToggle/);
  assert.match(html, /scrollCatalogIntoView/);
  assert.match(html, /search-shell/);
  assert.match(html, /continue-reading-shell/);
});

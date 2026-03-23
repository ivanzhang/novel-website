const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('reader 页面应包含详情回流、目录锚点和会员提示容器', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../frontend/reader.html'), 'utf8');

  assert.match(html, /readerSecondaryNav/);
  assert.match(html, /reader-secondary-action/);
  assert.match(html, /reader-controls-hidden/);
  assert.match(html, /updateReaderChromeVisibility/);
  assert.match(html, /settings-btn/);
  assert.match(html, /bookmark-btn/);
  assert.match(html, /comment-btn/);
  assert.match(html, /backToNovel\(\)/);
  assert.match(html, /viewCatalog\(\)/);
  assert.match(html, /viewRecommendations\(\)/);
  assert.match(html, /membershipPrompt/);
  assert.match(html, /renderMembershipPrompt/);
});

test('reader 顶部工具条样式应贴顶、深色且无圆角', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../frontend/style.css'), 'utf8');

  assert.match(css, /\.reader-secondary-nav\s*\{/);
  assert.match(css, /top:\s*0;/);
  assert.match(css, /background:\s*#2c3e50;/);
  assert.match(css, /border-radius:\s*0;/);
});

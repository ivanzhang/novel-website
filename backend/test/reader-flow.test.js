const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('reader 页面应包含详情回流、目录锚点和会员提示容器', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../frontend/reader.html'), 'utf8');

  assert.match(html, /readerSecondaryNav/);
  assert.match(html, /backToNovel\(\)/);
  assert.match(html, /viewCatalog\(\)/);
  assert.match(html, /viewRecommendations\(\)/);
  assert.match(html, /membershipPrompt/);
  assert.match(html, /renderMembershipPrompt/);
});

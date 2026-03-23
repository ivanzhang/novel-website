const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('membership 页面应包含会员中心导航和总览容器', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../frontend/membership.html'), 'utf8');

  assert.match(html, /member-sidebar/i);
  assert.match(html, /会员总览/);
  assert.match(html, /阅读记录/);
  assert.match(html, /member-overview/i);
  assert.match(html, /memberSidebarSummary/);
  assert.match(html, /memberAccountFacts/);
  assert.match(html, /retryLoadMemberCenter/);
  assert.match(html, /scrollSectionIntoView/);
  assert.match(html, /member-sidebar-toggle/);
  assert.match(html, /memberMobileStatus/);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeChapterContent } = require('../chapter-cleaner');

test('sanitizeChapterContent 应删除整句域名广告并保留正文段落', () => {
  const raw = [
    '第一段正文。',
    '请收藏本站最新网址 b i q u g e 。 c o m，继续阅读更方便。',
    '第二段正文。'
  ].join('\n');

  const cleaned = sanitizeChapterContent(raw);

  assert.equal(cleaned, '第一段正文。\n第二段正文。');
});

test('sanitizeChapterContent 应删除正文中的短域名广告片段', () => {
  const raw = '他刚推门而入，请记住最新域名 x-y-z·c c，眼前忽然一亮。';

  const cleaned = sanitizeChapterContent(raw);

  assert.equal(cleaned, '他刚推门而入，眼前忽然一亮。');
});

test('sanitizeChapterContent 不应误删普通英文和缩写', () => {
  const raw = '他提到VIP包厢和DNA检测结果，这些都不是广告。';

  const cleaned = sanitizeChapterContent(raw);

  assert.equal(cleaned, raw);
});

test('sanitizeChapterContent 应删除符号分隔的 cc/com/org/net/cn 水印标记', () => {
  const raw = [
    '泪流满面地认怂，biqu4ヽcc真顶不住了。',
    '感谢wp365☆org们天天倒班确实很辛苦。',
    '桑桑唱完了歌，轮到apxs。cc来唱。',
    '这一章结束于bqg229◆com',
    '这钱燕玲的本事还没到家！当即继续装糊涂道：“samsf ⊙net明白。”',
    '感谢htjb Θcc一直照顾。',
    '苏尘在biwu9点cc床上盘膝坐下。',
    '这类 token 也包括wannanniuer8♜cc',
    '还有fhxzh ⊕cc、yynyc ⊕com 和 biga9 ⊕com 这些。',
    '以及 akz8◇com、qg37◇cc、qushuwang◇cc、biqei◇cc 这些。'
  ].join('\n');

  const cleaned = sanitizeChapterContent(raw);

  assert.equal(cleaned, [
    '泪流满面地认怂，真顶不住了。',
    '感谢们天天倒班确实很辛苦。',
    '桑桑唱完了歌，轮到来唱。',
    '这一章结束于',
    '这钱燕玲的本事还没到家！当即继续装糊涂道：“明白。”',
    '感谢一直照顾。',
    '苏尘在床上盘膝坐下。',
    '这类 token 也包括',
    '还有、和这些。',
    '以及、、、这些。'
  ].join('\n'));
});

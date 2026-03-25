function normalizeInvisibleChars(text) {
  return String(text || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function compactDomainPattern(text) {
  return text
    .toLowerCase()
    .replace(/[。．・·•●‧•｡]/g, '.')
    .replace(/[_—－-]/g, '')
    .replace(/\s+/g, '');
}

function removeAdLines(text) {
  return text
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      const normalized = compactDomainPattern(line);
      const hasAdCue = /^(最新网址|最新域名|请收藏|收藏本站|访问|打开|请记住|记住|首发|百度搜索|手机用户请)/.test(trimmed);
      const hasDomain = /[a-z0-9]{2,}\.(?:com|cc|net|org)\b/.test(normalized);
      return !(hasAdCue && hasDomain);
    })
    .join('\n');
}

function removeInlineAds(text) {
  return text.replace(
    /(?:请收藏|收藏本站|请记住|记住|访问|打开|百度搜索|最新网址|最新域名)[^。！？!\n，,；;、]{0,60}?[a-zA-Z0-9\s._\-。．・·•●‧｡]{2,}(?:c\s*c|c\s*o\s*m|n\s*e\s*t|o\s*r\s*g)\b[^。！？!\n，,；;、]{0,20}/gu,
    ''
  );
}

function removeWatermarkTokens(text) {
  const token =
    '[a-z0-9]{2,}\\s*[ヽ●⊙◆◇¤○◎☆♀♟♜★Θ⊕點点。．・·•●‧｡]+\\s*(?:c\\s*c|c\\s*o\\s*m|o\\s*r\\s*g|n\\s*e\\s*t|c\\s*n)';
  const repeatedTokenPattern = new RegExp(`(?:${token})+`, 'giu');
  const tokenWithTrailingNoisePattern = new RegExp(`${token}(?:w{1,3})?(?=$|[^\\u4e00-\\u9fffa-z0-9])`, 'giu');
  const helperPhrasePattern = /w?书友整~?理提~?供/gu;

  return text
    .replace(repeatedTokenPattern, '')
    .replace(tokenWithTrailingNoisePattern, '')
    .replace(helperPhrasePattern, '');
}

function tidyWhitespace(text) {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/([\u4e00-\u9fff])[ \t]+([\u4e00-\u9fff])/g, '$1$2')
    .replace(/[，,]\s*[，,]/g, '，')
    .replace(/[，,]\s*(。|！|？)/g, '$1')
    .replace(/([，、。！？“”‘’（）()])[ \t]+/g, '$1')
    .replace(/[ \t]+([，、。！？“”‘’（）()])/g, '$1')
    .replace(/([。！？]\s*)[，,]/g, '$1')
    .replace(/[，,]\s*([。！？])/g, '$1')
    .replace(/^\s+|\s+$/g, '');
}

function sanitizeChapterContent(rawText) {
  const normalized = normalizeInvisibleChars(rawText);
  const withoutAdLines = removeAdLines(normalized);
  const withoutInlineAds = removeInlineAds(withoutAdLines);
  const withoutWatermarks = removeWatermarkTokens(withoutInlineAds);
  return tidyWhitespace(withoutWatermarks);
}

module.exports = {
  sanitizeChapterContent,
};

const IMPORT_ITEM_STATUS = Object.freeze({
  COLLECTED: 'collected',
  PARSED: 'parsed',
  PENDING_CLASSIFICATION: 'pending_classification',
  PENDING_DUPLICATE_REVIEW: 'pending_duplicate_review',
  PENDING_PUBLISH: 'pending_publish',
  PUBLISHED: 'published',
  FAILED: 'failed',
});

const SOURCE_CATEGORY_MAP = new Map([
  ['玄幻奇幻', '玄幻'],
  ['武侠仙侠', '仙侠'],
  ['都市言情', '都市'],
]);

const KEYWORD_RULES = [
  { keywords: ['修仙', '飞升', '宗门'], category: '仙侠' },
  { keywords: ['豪门', '总裁', '替嫁'], category: '言情' },
  { keywords: ['丧尸', '废土', '末日'], category: '科幻' },
  { keywords: ['吕布', '大唐', '三国'], category: '历史' },
];

const FAILURE_REASON_MAP = new Map([
  ['missing_title', '未识别书名'],
  ['missing_author', '作者为空'],
  ['missing_intro', '简介缺失'],
  ['zero_chapters', '章节提取为 0'],
  ['broken_text', '正文疑似乱码'],
  ['html_mismatch', 'HTML 结构不匹配'],
  ['duplicate', '疑似与已有书重复'],
  ['suspected_duplicate', '疑似与已有书重复'],
]);

const TITLE_NOISE_WORDS = ['最新章节', '无弹窗', '全文阅读', '笔趣阁'];

function toText(value) {
  return value == null ? '' : String(value);
}

function stripPunctuation(input) {
  return input
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .replace(/[【】\[\]（）()《》<>「」『』]/g, '')
    .replace(/[·•\-—_~`!@#$%^&*+=|\\/:;,.，。！？、？“”‘’"'￥]/g, '');
}

function normalizeTitle(input) {
  let title = toText(input).normalize('NFKC');

  for (const word of TITLE_NOISE_WORDS) {
    title = title.replace(new RegExp(word, 'g'), '');
  }

  return stripPunctuation(title);
}

function normalizeAuthor(input) {
  return stripPunctuation(toText(input))
    .replace(/(著|作者)$/u, '');
}

function suggestClassification({ sourceCategory, title, intro } = {}) {
  const normalizedSourceCategory = toText(sourceCategory).normalize('NFKC').replace(/\s+/g, '');
  const sourceCategoryMatch = SOURCE_CATEGORY_MAP.get(normalizedSourceCategory);

  if (sourceCategoryMatch) {
    return {
      category: sourceCategoryMatch,
      matchedBy: 'sourceCategory',
      matchedValue: normalizedSourceCategory,
    };
  }

  const normalizedTitle = normalizeTitle(title);
  const normalizedIntro = normalizeTitle(intro);

  for (const rule of KEYWORD_RULES) {
    for (const keyword of rule.keywords) {
      if (normalizedTitle.includes(keyword)) {
        return {
          category: rule.category,
          matchedBy: 'titleKeyword',
          matchedValue: keyword,
        };
      }

      if (normalizedIntro.includes(keyword)) {
        return {
          category: rule.category,
          matchedBy: 'introKeyword',
          matchedValue: keyword,
        };
      }
    }
  }

  return {
    category: '其他',
    matchedBy: 'default',
    matchedValue: '',
  };
}

function scoreDuplicateCandidate({ importedItem = {}, existingNovel = {} } = {}) {
  const importedTitle = normalizeTitle(importedItem.title);
  const existingTitle = normalizeTitle(existingNovel.title);
  const importedAuthor = normalizeAuthor(importedItem.author);
  const existingAuthor = normalizeAuthor(existingNovel.author);
  const importedChapterCount = Number(importedItem.chapterCount) || 0;
  const existingChapterCount = Number(existingNovel.chapterCount) || 0;

  let score = 0;

  if (importedTitle && importedTitle === existingTitle) {
    score += 40;
  }

  if (importedAuthor && existingAuthor && (
    importedAuthor === existingAuthor
    || importedAuthor.includes(existingAuthor)
    || existingAuthor.includes(importedAuthor)
  )) {
    score += importedAuthor === existingAuthor ? 25 : 15;
  }

  if (importedChapterCount && existingChapterCount) {
    const diff = Math.abs(importedChapterCount - existingChapterCount);

    if (diff === 0) {
      score += 30;
    } else if (diff <= 2) {
      score += 20;
    } else if (diff <= 10) {
      score += 10;
    }
  }

  score = Math.min(score, 100);

  let level = 'low';
  if (score >= 80) {
    level = 'high';
  } else if (score >= 50) {
    level = 'medium';
  }

  return {
    score,
    level,
  };
}

function summarizeFailureReason(code, detail) {
  const reason = FAILURE_REASON_MAP.get(toText(code)) || '未知错误';

  if (!detail) {
    return reason;
  }

  return `${reason}：${detail}`;
}

module.exports = {
  IMPORT_ITEM_STATUS,
  normalizeTitle,
  suggestClassification,
  scoreDuplicateCandidate,
  summarizeFailureReason,
};

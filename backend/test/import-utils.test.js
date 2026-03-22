const test = require('node:test');
const assert = require('node:assert/strict');

const {
  IMPORT_ITEM_STATUS,
  normalizeTitle,
  normalizeAuthor,
  suggestClassification,
  scoreDuplicateCandidate,
  summarizeFailureReason,
} = require('../admin/import-utils');

test('IMPORT_ITEM_STATUS 应该暴露导入条目的标准状态', () => {
  assert.deepEqual(IMPORT_ITEM_STATUS, {
    COLLECTED: 'collected',
    PARSED: 'parsed',
    PENDING_CLASSIFICATION: 'pending_classification',
    PENDING_DUPLICATE_REVIEW: 'pending_duplicate_review',
    PENDING_PUBLISH: 'pending_publish',
    PUBLISHED: 'published',
    FAILED: 'failed',
  });
});

test('normalizeTitle 应移除常见盗版站噪音词', () => {
  assert.equal(normalizeTitle('万相之王 最新章节 无弹窗'), '万相之王');
});

test('normalizeAuthor 应可被导出并去除作者后缀', () => {
  assert.equal(normalizeAuthor('天蚕土豆著'), '天蚕土豆');
});

test('suggestClassification 应优先命中来源栏目映射', () => {
  const result = suggestClassification({
    sourceCategory: '武侠仙侠',
    title: '不重要的标题',
    intro: '不重要的简介',
  });

  assert.deepEqual(result, {
    category: '仙侠',
    matchedBy: 'sourceCategory',
    matchedValue: '武侠仙侠',
  });
});

test('suggestClassification 应在栏目不足时命中标题关键词', () => {
  const result = suggestClassification({
    sourceCategory: '未知分类',
    title: '修仙宗门录',
    intro: '不重要的简介',
  });

  assert.deepEqual(result, {
    category: '仙侠',
    matchedBy: 'titleKeyword',
    matchedValue: '修仙',
  });
});

test('suggestClassification 应命中简介关键词', () => {
  const result = suggestClassification({
    sourceCategory: '未知分类',
    title: '不重要的标题',
    intro: '故事里有丧尸和废土世界',
  });

  assert.deepEqual(result, {
    category: '科幻',
    matchedBy: 'introKeyword',
    matchedValue: '丧尸',
  });
});

test('suggestClassification 应命中历史关键词', () => {
  const result = suggestClassification({
    sourceCategory: '未知分类',
    title: '吕布归来',
    intro: '不重要的简介',
  });

  assert.deepEqual(result, {
    category: '历史',
    matchedBy: 'titleKeyword',
    matchedValue: '吕布',
  });
});

test('scoreDuplicateCandidate 应为高相似候选返回 high', () => {
  const result = scoreDuplicateCandidate({
    importedItem: {
      title: '万相之王 最新章节 无弹窗',
      author: '天蚕土豆',
      chapterCount: 1837,
      intro: '天地间有万相，万相之王',
    },
    existingNovel: {
      title: '万相之王',
      author: '天蚕土豆',
      chapterCount: 1838,
      intro: '天地间有万相，万相之王',
    },
  });

  assert.equal(result.level, 'high');
  assert.ok(result.score >= 80);
});

test('scoreDuplicateCandidate 应为中相似候选返回 medium', () => {
  const result = scoreDuplicateCandidate({
    importedItem: {
      title: '万相之王 最新章节 无弹窗',
      author: '天蚕土豆改',
      chapterCount: 1837,
      intro: '天地间有万相',
    },
    existingNovel: {
      title: '万相之王',
      author: '天蚕土豆',
      chapterCount: 1760,
      intro: '天地间有万相',
    },
  });

  assert.equal(result.level, 'medium');
  assert.ok(result.score >= 50 && result.score < 80);
});

test('scoreDuplicateCandidate 应为低相似候选返回 low', () => {
  const result = scoreDuplicateCandidate({
    importedItem: {
      title: '月球崛起',
      author: '未知作者',
      chapterCount: 12,
      intro: '一个完全不同的故事',
    },
    existingNovel: {
      title: '万相之王',
      author: '天蚕土豆',
      chapterCount: 1838,
      intro: '天地间有万相',
    },
  });

  assert.equal(result.level, 'low');
  assert.ok(result.score < 50);
});

test('summarizeFailureReason 应把失败码标准化为中文描述', () => {
  assert.equal(summarizeFailureReason('missing_title'), '未识别书名');
  assert.equal(
    summarizeFailureReason('duplicate', '与《万相之王》高度相似'),
    '疑似与已有书重复：与《万相之王》高度相似'
  );
});

/**
 * 评论导出脚本的纯逻辑工具。
 *
 * 使用示例：
 *   const {
 *     buildMainCommentParams,
 *     shouldFetchComments,
 *   } = require('./lib/comment_export_core');
 *
 *   const params = buildMainCommentParams({
 *     videoId: 'abc123',
 *     pageNumber: 1,
 *     pageSize: 15,
 *     now: new Date().toISOString(),
 *   });
 *
 *   const shouldFetch = shouldFetchComments({ commentCount: 3 });
 */

function toSafeString(value) {
  return String(value ?? '').trim();
}

function getSourceCommentCount(video) {
  const count = Number(video?.raw?.commentCount ?? video?.commentCount ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function shouldFetchComments({ commentCount, forceAll = false }) {
  return Boolean(forceAll) || Number(commentCount) > 0;
}

function buildMainCommentParams({
  videoId,
  objType = 'video',
  pageNumber,
  pageSize,
  now,
}) {
  return {
    objID: toSafeString(videoId),
    objType: toSafeString(objType || 'video'),
    curTime: toSafeString(now),
    pageNumber: toSafeString(pageNumber),
    pageSize: toSafeString(pageSize),
  };
}

function buildReplyCommentParams({
  parentComment,
  pageNumber,
  pageSize,
  now,
}) {
  const firstReplyId = parentComment?.Info?.[0]?.id;
  return {
    objID: toSafeString(parentComment?.objID),
    cmtId: toSafeString(parentComment?.id),
    fstID: toSafeString(firstReplyId),
    curTime: toSafeString(now),
    pageNumber: toSafeString(pageNumber),
    pageSize: toSafeString(pageSize),
  };
}

function mergeReplies(previewReplies = [], fetchedReplies = []) {
  const merged = [];
  const seen = new Set();

  for (const reply of [...previewReplies, ...fetchedReplies]) {
    const replyId = toSafeString(reply?.id);
    if (!replyId || seen.has(replyId)) continue;
    seen.add(replyId);
    merged.push(reply);
  }

  return merged;
}

function buildSkippedCommentFile({ video, fetchedAt, reason }) {
  const sourceCommentCount = getSourceCommentCount(video);

  return {
    id: toSafeString(video?.id),
    title: toSafeString(video?.title),
    categoryList: Array.isArray(video?.categoryList) ? video.categoryList : [],
    objType: 'video',
    sourceCommentCount,
    fetchStatus: 'skipped',
    fetchReason: toSafeString(reason),
    fetchedAt: toSafeString(fetchedAt),
    counts: {
      sourceCommentCount,
      totalFromApi: 0,
      mainCommentsFetched: 0,
      replyCommentsFetched: 0,
      totalCommentNodesFetched: 0,
    },
    pagination: {
      mainPagesFetched: 0,
      replyRequests: 0,
      replyPagesFetched: 0,
    },
    comments: [],
  };
}

module.exports = {
  buildMainCommentParams,
  buildReplyCommentParams,
  buildSkippedCommentFile,
  getSourceCommentCount,
  mergeReplies,
  shouldFetchComments,
  toSafeString,
};

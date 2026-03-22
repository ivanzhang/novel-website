const db = require('./db');

// 3-tier premium access check:
// 1. chapter.is_premium → true
// 2. novel.is_premium && novel.free_chapters > 0 → chapter_number > free_chapters
// 3. novel.is_premium → true
function checkPremiumAccess(chapter, novel) {
  if (chapter.is_premium) return true;
  if (novel && novel.is_premium && novel.free_chapters > 0) {
    return chapter.chapter_number > novel.free_chapters;
  }
  if (novel && novel.is_premium) return true;
  return false;
}

function isActiveMember(user) {
  return user && user.is_member && user.member_expire && new Date(user.member_expire) > new Date();
}

module.exports = { checkPremiumAccess, isActiveMember };

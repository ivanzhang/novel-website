const API_HOST = process.env.APIBI_API_HOST || 'https://apibi.cc';
const API_TIMEOUT = 15000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

async function fetchBook(bookId) {
  try {
    const response = await fetchWithTimeout(`${API_HOST}/api/book?id=${bookId}`);
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    const data = await response.json();
    return {
      success: true,
      data: {
        id: parseInt(data.id),
        title: data.title,
        author: data.author,
        category: data.sortname,
        status: data.full,
        description: data.intro,
        lastChapterId: data.lastchapterid,
        lastChapter: data.lastchapter,
        lastUpdate: data.lastupdate,
        chapterCount: parseInt(data.cs) || 0,
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function fetchChapter(bookId, chapterId) {
  try {
    const response = await fetchWithTimeout(`${API_HOST}/api/chapter?id=${bookId}&chapterid=${chapterId}`);
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    const data = await response.json();
    return {
      success: true,
      data: {
        id: parseInt(data.id),
        chapterId: parseInt(data.chapterid),
        title: data.title,
        author: data.author,
        chapterName: data.chaptername,
        chapterCount: parseInt(data.cs) || 0,
        content: data.txt || '',
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

function buildCoverUrl(bookId) {
  const basePath = process.env.STORAGE_PATH || 'storage/json/all';
  return `${basePath}/covers/${bookId}.jpg`;
}

function buildBookJsonPath(bookId) {
  const basePath = process.env.STORAGE_PATH || 'storage/json/all';
  return `${basePath}/books/${bookId}.json`;
}

module.exports = {
  fetchBook,
  fetchChapter,
  buildCoverUrl,
  buildBookJsonPath,
  API_HOST
};

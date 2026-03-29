const fs = require('fs');
const path = require('path');

const BOOKS_DIR = process.env.STORAGE_PATH 
  ? path.join(process.env.STORAGE_PATH, 'books')
  : path.join(__dirname, '..', 'storage', 'json', 'all', 'books');

function searchBooks(query, options = {}) {
  const {
    limit = 20,
    offset = 0,
    category = null
  } = options;

  if (!query || query.trim().length < 1) {
    return { novels: [], total: 0 };
  }

  const searchTerm = query.trim().toLowerCase();
  const results = [];
  let total = 0;

  const files = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    if (results.length >= limit + offset && total > limit + offset) {
      break;
    }

    try {
      const filePath = path.join(BOOKS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const book = JSON.parse(content);

      const titleMatch = book.title && book.title.toLowerCase().includes(searchTerm);
      const authorMatch = book.author && book.author.toLowerCase().includes(searchTerm);

      if (!titleMatch && !authorMatch) continue;

      total++;

      if (total > offset && results.length < limit) {
        results.push({
          id: book.bookId,
          title: book.title,
          author: book.author,
          category: book.category,
          status: book.status,
          description: book.intro,
          lastUpdate: book.lastUpdate,
          lastChapter: book.lastChapter,
          chapterCount: book.chapterCount,
          cover_url: `/storage/json/all/covers/${book.bookId}.jpg`
        });
      }
    } catch (error) {
      continue;
    }
  }

  return { novels: results, total };
}

function getNovelById(bookId) {
  const filePath = path.join(BOOKS_DIR, `${bookId}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const book = JSON.parse(content);
    
    return {
      id: book.bookId,
      title: book.title,
      author: book.author,
      category: book.category,
      status: book.status,
      description: book.intro,
      lastUpdate: book.lastUpdate,
      lastChapter: book.lastChapter,
      chapterCount: book.chapterCount,
      chapters: book.chapters || [],
      cover_url: `/storage/json/all/covers/${book.bookId}.jpg`
    };
  } catch (error) {
    return null;
  }
}

function getChapterList(bookId) {
  const book = getNovelById(bookId);
  if (!book || !book.chapters) {
    return [];
  }

  return book.chapters.map(ch => ({
    chapter_number: ch.chapterNumber,
    title: ch.title,
    chapterId: ch.chapterId || ch.chapterNumber
  }));
}

function getCategories() {
  const categories = new Map();
  const files = fs.readdirSync(BOOKS_DIR).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    try {
      const filePath = path.join(BOOKS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const book = JSON.parse(content);
      
      if (book.category) {
        const count = categories.get(book.category) || 0;
        categories.set(book.category, count + 1);
      }
    } catch (error) {
      continue;
    }
  }

  return Array.from(categories.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

module.exports = {
  searchBooks,
  getNovelById,
  getChapterList,
  getCategories,
  BOOKS_DIR
};

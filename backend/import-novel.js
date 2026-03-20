#!/usr/bin/env node

// 小说导入工具
// 用法: node import-novel.js --title "书名" --author "作者" --file novel.txt [--description "简介"] [--premium] [--free-chapters 5]

const fs = require('fs');
const path = require('path');

// 设置 DB_PATH 以便在项目根目录运行
if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.join(__dirname, 'novels.db');
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'import-tool-no-auth-needed';
}

const db = require('./db');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--title': opts.title = args[++i]; break;
      case '--author': opts.author = args[++i]; break;
      case '--file': opts.file = args[++i]; break;
      case '--description': opts.description = args[++i]; break;
      case '--premium': opts.isPremium = true; break;
      case '--free-chapters': opts.freeChapters = parseInt(args[++i]) || 0; break;
      case '--help': printHelp(); process.exit(0);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
小说导入工具

用法:
  node import-novel.js --title "书名" --author "作者" --file novel.txt

选项:
  --title         小说标题（必填）
  --author        作者名（必填）
  --file          文本文件路径（必填）
  --description   小说简介
  --premium       标记为 VIP 小说
  --free-chapters 免费章节数（默认 0）
  --help          显示帮助

章节分割:
  工具会自动识别以下格式的章节标题：
  - 第X章：标题 / 第X章:标题
  - 支持中文数字和阿拉伯数字
  如果没有匹配到章节标记，整个内容作为第一章。
`);
}

function splitChapters(content) {
  const chapterRegex = /第[一二三四五六七八九十百千万\d]+章[：:]\s*(.+?)(?=\n\n|$)/g;
  const parts = content.split(chapterRegex);
  const chapters = [];

  if (parts.length <= 1) {
    chapters.push({ title: '第一章', content: content.trim() });
  } else {
    let num = 1;
    for (let i = 1; i < parts.length; i += 2) {
      const title = parts[i]?.trim() || `第${num}章`;
      const body = parts[i + 1]?.trim() || '';
      if (body) {
        chapters.push({ title, content: body });
        num++;
      }
    }
  }

  return chapters;
}

function importNovel(opts) {
  const { title, author, file, description, isPremium, freeChapters } = opts;

  if (!title || !author || !file) {
    console.error('错误: --title, --author, --file 为必填参数');
    console.error('运行 node import-novel.js --help 查看帮助');
    process.exit(1);
  }

  if (!fs.existsSync(file)) {
    console.error(`错误: 文件不存在: ${file}`);
    process.exit(1);
  }

  // 检查重复标题
  const existing = db.prepare('SELECT id FROM novels WHERE title = ?').get(title);
  if (existing) {
    console.error(`跳过: 小说 "${title}" 已存在 (ID: ${existing.id})`);
    process.exit(1);
  }

  const content = fs.readFileSync(file, 'utf-8');
  const chapters = splitChapters(content);

  if (chapters.length === 0) {
    console.error('错误: 未能从文件中提取任何章节');
    process.exit(1);
  }

  // 插入小说（不存储全文，只存章节）
  const insertNovel = db.prepare(
    'INSERT INTO novels (title, author, is_premium, chapter_count, description, free_chapters) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = insertNovel.run(title, author, isPremium ? 1 : 0, chapters.length, description || '', freeChapters || 0);
  const novelId = result.lastInsertRowid;

  // 插入章节
  const insertChapter = db.prepare(
    'INSERT INTO chapters (novel_id, chapter_number, title, content, is_premium, word_count) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const insertAll = db.transaction(() => {
    chapters.forEach((ch, i) => {
      insertChapter.run(novelId, i + 1, ch.title, ch.content, 0, ch.content.length);
    });
  });

  insertAll();

  console.log(`导入成功!`);
  console.log(`  小说: ${title}`);
  console.log(`  作者: ${author}`);
  console.log(`  章节: ${chapters.length} 章`);
  console.log(`  ID: ${novelId}`);
}

const opts = parseArgs();
importNovel(opts);

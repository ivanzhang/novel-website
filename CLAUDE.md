# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 语言

始终用中文回复我，包括所有解释、注释和提问。

## gstack

所有 gstack skill 的输出使用中文。

## Project Overview

Chinese novel reading website (中文小说阅读网) — a full-stack web app with JWT auth, chapter-based reading, membership/VIP system, bookmarks, comments, ratings, and search.

## Commands

```bash
# Install backend dependencies
cd backend && npm install

# Start backend server (port 3000)
cd backend && npm start

# Serve frontend (port 8080)
cd frontend && python3 -m http.server 8080

# Run API tests
chmod +x test-api.sh && ./test-api.sh

# Test account: testuser / test123
```

## Architecture

**Backend:** Node.js + Express + better-sqlite3 (SQLite). Single-file API server (`server.js`) with JWT auth middleware (`auth.js`) and database init/migration (`db.js`).

**Frontend:** Vanilla HTML/CSS/JS — no build step, no framework. 6 HTML pages served as static files. All API calls go to `http://localhost:3000/api`.

**Auth flow:** Login → JWT token stored in `localStorage` → sent as `Authorization: Bearer <token>` header on authenticated requests.

**Database:** SQLite file at `backend/novels.db`. Schema defined and auto-migrated in `db.js` on startup. 8 tables: users, novels, chapters, reading_progress, orders, bookmarks, comments, ratings.

## Key Patterns

- All frontend pages use inline `<script>` tags — no module system or bundler
- `db.js` runs migrations and seeds sample data on first startup (regex-based chapter splitting from novel content)
- Premium content uses a 3-tier permission check: chapter-level `is_premium` → novel `free_chapters` count → novel-level `is_premium`
- Reader caches chapters in `sessionStorage` (30-min TTL) and preloads the next chapter
- Reading settings (font size, night mode) persist to `localStorage`
- Reading progress auto-saves on scroll (2s debounce) and reading time tracks every 30s
- Search uses 500ms debounce on the frontend; backend uses SQL LIKE with `%query%`

## Language

All UI text, comments in HTML files, and documentation are in Chinese (Simplified). Backend code comments are minimal. API responses use English keys with Chinese string values.

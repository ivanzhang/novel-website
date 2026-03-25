# Biquge 章节正文 CDN 迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `storage/json/biquge/chapters` 的正文 JSON 迁移到 TG/CF CDN，并让运行时读取优先走 CDN，迁移成功后立即删除本地章节文件。

**Architecture:** 在 `chapters` 表新增 `content_cdn_url` 字段；读取链路优先远程 CDN JSON、本地文件作为迁移期兜底；新增章节迁移 CLI（每批 10 个）负责上传、写映射、更新数据库、删除本地文件。

**Tech Stack:** Node.js、SQLite、Express、fetch、Telegram/Cloudflare CDN

---

### Task 1: 扩展 schema 与读取链路测试（先红）

**Files:**
- Modify: `backend/test/json-import-schema.test.js`
- Modify: `backend/test/chapter-content.test.js`

- [ ] **Step 1: 为 `chapters.content_cdn_url` 增加 schema 断言测试**
- [ ] **Step 2: 新增 `loadChapterContent` 优先读 CDN 的失败测试**
- [ ] **Step 3: 新增 CDN 失败回退本地文件的失败测试**
- [ ] **Step 4: 运行测试确认失败（RED）**

Run:
```bash
node --test backend/test/json-import-schema.test.js
node --test backend/test/chapter-content.test.js
```

### Task 2: 实现 schema 与读取链路（转绿）

**Files:**
- Modify: `backend/db.js`
- Modify: `backend/chapter-content.js`

- [ ] **Step 1: 在 `db.js` 增加 `content_cdn_url` 列升级逻辑**
- [ ] **Step 2: 在 `chapter-content.js` 实现 CDN JSON 读取函数**
- [ ] **Step 3: `loadChapterContent` 改为优先 CDN、失败回退本地**
- [ ] **Step 4: 运行 Task 1 测试确认通过（GREEN）**

### Task 3: 先写章节迁移脚本测试（先红）

**Files:**
- Create: `backend/test/upload-biquge-chapter-cdn.test.js`

- [ ] **Step 1: 测试扫描章节文件并按 10 个分组**
- [ ] **Step 2: 测试映射 key 采用 `bookId/chapter.json`**
- [ ] **Step 3: 测试上传成功后更新 DB 的 `content_cdn_url`**
- [ ] **Step 4: 测试 `--delete-local` 仅在上传+写库成功后删除本地文件**
- [ ] **Step 5: 运行测试确认失败（RED）**

Run:
```bash
node --test backend/test/upload-biquge-chapter-cdn.test.js
```

### Task 4: 实现章节迁移脚本（转绿）

**Files:**
- Create: `backend/upload-biquge-chapter-cdn.js`
- Modify: `backend/package.json`

- [ ] **Step 1: 实现参数解析与目录扫描**
- [ ] **Step 2: 复用批量上传策略（每批 10 个）并写映射文件**
- [ ] **Step 3: 按 `source_book_id + chapter_number` 更新 DB**
- [ ] **Step 4: 成功后删除本地章节文件（delete-local）**
- [ ] **Step 5: 补齐中文注释与 usage 示例**
- [ ] **Step 6: 运行 Task 3 测试确认通过（GREEN）**

### Task 5: 集成回归与小样本实跑

**Files:**
- Modify: `backend/test/chapter-content.test.js`（如需补边界）
- Read/Write: `storage/json/biquge`

- [ ] **Step 1: 跑受影响测试集**

Run:
```bash
node --test backend/test/chapter-content.test.js
node --test backend/test/json-import-schema.test.js
node --test backend/test/upload-biquge-chapter-cdn.test.js
```

- [ ] **Step 2: 小样本迁移 100 章并删除本地文件**

Run:
```bash
node backend/upload-biquge-chapter-cdn.js \
  --root storage/json/biquge \
  --endpoint https://aixs.us.ci/upload \
  --limit 100 \
  --batch-size 10 \
  --delete-local
```

- [ ] **Step 3: 抽查数据库与在线读取**

Run:
```bash
node -e "process.env.DB_PATH='backend/novels.db';const db=require('./backend/db');const c=db.prepare(\"SELECT COUNT(*) c FROM chapters WHERE content_cdn_url IS NOT NULL AND TRIM(content_cdn_url)!=''\").get().c;console.log(c);db.close&&db.close();"
```

- [ ] **Step 4: 输出全量长期任务命令（可断点续跑）**

### Task 6: 运行手册补充

**Files:**
- Modify: `docs/superpowers/specs/2026-03-25-biquge-chapter-cdn-migration-design.md`（必要时）

- [ ] **Step 1: 记录“先上传再删本地”安全条件**
- [ ] **Step 2: 记录全量迁移建议参数（批速/重试/分段）**
- [ ] **Step 3: 给出部署侧变更：去掉 `storage` 挂载依赖**

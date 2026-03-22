# Biquge JSON Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 `storage/json/biquge` 批量导入小说元数据和章节目录到现有 SQLite 数据库，并让章节正文继续保存在 JSON 文件中，通过文件路径与摘要关联

**Architecture:** 保持现有 Node.js + Express + SQLite 结构，不引入新框架，也不复用 `import_jobs/source_records/import_items` staging 体系。数据库只承载小说检索、章节目录和正文定位信息；新增一个专用 JSON 导入脚本扫描 `books/*.json` 与 `chapters/<bookId>/*.json`，按 `source_site + source_book_id` 优先、归一化后的 `title + author` 兜底做覆盖更新。数据库里的 `content_file_path` 统一存储为相对内容根目录 `storage/json/biquge` 的相对路径，`--root` 只影响导入扫描来源，不改变存储基准。

**Tech Stack:** Node.js、better-sqlite3、原生文件系统 API、node:test、Express

---

### Task 1: 扩展数据库字段以承载 JSON 导入元数据

**Files:**
- Modify: `backend/db.js`
- Test: `backend/test/json-import-schema.test.js`

- [ ] **Step 1: 写失败测试**
覆盖以下字段或结构存在：
- `novels.source_site`
- `novels.source_book_id`
- `novels.source_category`
- `novels.primary_category`
- `novels.cover_url`
- `novels.content_storage`
- `chapters.source_chapter_id`
- `chapters.content_file_path`
- `chapters.content_preview`

- [ ] **Step 2: 运行失败测试**

Run: `node --test backend/test/json-import-schema.test.js`
Expected: FAIL，提示新增列不存在

- [ ] **Step 3: 在 `backend/db.js` 以最小迁移方式补齐列和必要索引**
需要保证：
- 旧库可升级，包含已有 `novels` / `chapters` 表的 `ALTER TABLE` 补列路径
- 数据库初始化可重复执行
- `novels` 支持按来源键查找
- `chapters` 支持正文文件路径定位

- [ ] **Step 4: 增加一条旧库升级测试**
要求：
- 先构造不含这些新列的旧版 `novels` / `chapters`
- 再加载 `backend/db.js`
- 验证新增列被自动补齐且不报错

- [ ] **Step 5: 重新运行测试，确认通过**

Run: `node --test backend/test/json-import-schema.test.js`
Expected: PASS

- [ ] **Step 6: 提交 schema 扩展**

```bash
git add backend/db.js backend/test/json-import-schema.test.js
git commit -m "feat: add biquge json import schema"
```

### Task 2: 实现 JSON 导入纯函数与文件解析

**Files:**
- Create: `backend/json-import/utils.js`
- Test: `backend/test/json-import-utils.test.js`

- [ ] **Step 1: 写失败测试**
覆盖：
- 从 `books/<bookId>.json` 抽取标准化书级元数据
- 从 `chapters/<bookId>/<chapter>.json` 生成相对路径
- 生成章节摘要
- 源分类到 `primary_category` 的轻映射
- 稳定键生成：优先 `bookId`，兜底 `title + author`

- [ ] **Step 2: 运行失败测试**

Run: `node --test backend/test/json-import-utils.test.js`
Expected: FAIL，提示模块缺失或导出缺失

- [ ] **Step 3: 实现 `backend/json-import/utils.js` 的最小纯函数**
至少包含：
- `mapPrimaryCategory(sourceCategory)`
- `buildNovelLookupKey(book)`
- `buildChapterFilePath(bookId, chapterNumber)`
- `buildContentPreview(content)`
- `normalizeBookRecord(bookJson, rootDir)`
- `normalizeChapterRecord(bookJson, chapterJson, rootDir)`

约束：
- 主分类映射只做轻映射，不重新发明复杂分类体系
- `title + author` 兜底匹配明确复用现有 `backend/admin/import-utils.js` 的归一化逻辑，避免重复书

- [ ] **Step 4: 重新运行测试，确认通过**

Run: `node --test backend/test/json-import-utils.test.js`
Expected: PASS

- [ ] **Step 5: 提交纯函数**

```bash
git add backend/json-import/utils.js backend/test/json-import-utils.test.js
git commit -m "feat: add biquge json import utilities"
```

### Task 3: 实现数据库覆盖导入仓储

**Files:**
- Create: `backend/json-import/repository.js`
- Test: `backend/test/json-import-repository.test.js`

- [ ] **Step 1: 写失败测试**
覆盖：
- 通过 `source_site + source_book_id` 查找已有小说
- 没有 `source_book_id` 时退回 `title + author`
- 已有小说覆盖更新元数据
- 按小说维度删除旧章节并重建目录

- [ ] **Step 2: 运行失败测试**

Run: `node --test backend/test/json-import-repository.test.js`
Expected: FAIL，提示仓储不存在或行为不符

- [ ] **Step 3: 实现最小仓储层**
至少包含：
- `findNovelForImport(record)`
- `upsertNovel(record)`
- `replaceChapters(novelId, chapterRecords)`

要求：
- 每本书的 `upsertNovel + replaceChapters` 必须包在同一个数据库事务里
- 任一步失败时，该书不得留下半覆盖状态

- [ ] **Step 4: 重新运行测试，确认通过**

Run: `node --test backend/test/json-import-repository.test.js`
Expected: PASS

- [ ] **Step 5: 提交仓储层**

```bash
git add backend/json-import/repository.js backend/test/json-import-repository.test.js
git commit -m "feat: add biquge json import repository"
```

### Task 4: 实现 JSON 批量导入脚本

**Files:**
- Create: `backend/import-biquge-json.js`
- Modify: `backend/package.json`
- Test: `backend/test/import-biquge-json.test.js`

- [ ] **Step 1: 写失败测试**
覆盖：
- 扫描 `storage/json/biquge/books/*.json`
- 匹配对应 `chapters/<bookId>/*.json`
- 生成导入统计：总数、新增、更新、失败、缺失正文文件数
- 支持 `--root` 指定导入目录

- [ ] **Step 2: 运行失败测试**

Run: `node --test backend/test/import-biquge-json.test.js`
Expected: FAIL，提示脚本或导出入口不存在

- [ ] **Step 3: 实现导入脚本**
需要做到：
- 逐本读取 `books/*.json`
- 按章节号找到对应正文 JSON
- 把正文摘要写入数据库，把正文文件相对路径写入 `content_file_path`
- 不把大正文写进数据库
- 输出中文统计信息

路径规则：
- 数据库存储的 `content_file_path` 一律相对 `storage/json/biquge`
- `--root` 只作为导入脚本的扫描源目录；如果不是 `storage/json/biquge`，脚本需要先归一化出相对于该内容根目录的路径

- [ ] **Step 4: 在 `backend/package.json` 增加运行命令**
建议命令：
- `import:biquge-json`

- [ ] **Step 5: 重新运行测试，确认通过**

Run: `node --test backend/test/import-biquge-json.test.js`
Expected: PASS

- [ ] **Step 6: 提交导入脚本**

```bash
git add backend/import-biquge-json.js backend/package.json backend/test/import-biquge-json.test.js
git commit -m "feat: add biquge json import script"
```

### Task 5: 执行真实导入并验证结果

**Files:**
- Modify: `README.md`
- Modify: `QUICK_REFERENCE.md`

- [ ] **Step 1: 跑与 JSON 导入相关的全部测试**

Run: `node --test backend/test/json-import-schema.test.js backend/test/json-import-utils.test.js backend/test/json-import-repository.test.js backend/test/import-biquge-json.test.js`
Expected: 全部 PASS

- [ ] **Step 2: 执行真实导入**

Run: `node backend/import-biquge-json.js --root storage/json/biquge`
Expected: 输出中文导入统计，数据库写入小说和章节目录

- [ ] **Step 3: 抽样验证导入结果**
至少检查：
- 小说总数
- 某一本书的 `source_book_id`
- 某几章的 `content_file_path`
- 某几章的 `content_preview`

- [ ] **Step 4: 更新 README 与快捷参考，记录导入命令和正文存储策略**

- [ ] **Step 5: 提交文档与验证收尾**

```bash
git add README.md QUICK_REFERENCE.md
git commit -m "docs: add biquge json import usage"
```

## 备注

- 本计划只覆盖“可靠 JSON 快速导入”闭环，不接 staging 审核流，不做后台 UI，也不改阅读接口。
- 当前 `storage/json/biquge` 已包含 `books/*.json` 和 `chapters/<bookId>/*.json`，设计以这两层结构为准。
- 章节正文继续存 JSON 文件，数据库不再承担大正文持久化。

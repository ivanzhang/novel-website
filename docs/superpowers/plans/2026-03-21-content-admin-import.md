# Content Admin Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有中文小说阅读站实现第一阶段后台内容导入工作台，支持导入任务、staging 数据区、规则分类、疑似重复审核与批量上架

**Architecture:** 继续沿用现有 Node.js + Express + SQLite + 静态 HTML 结构，不引入前端框架。后端通过新增 staging 表、纯函数工具和独立 `admin` 路由承接后台流程；前端通过单页 `admin.html` 驱动工作台、导入列表、分类和重复审核，优先打通“导入 -> 分类 -> 去重 -> 上架”最小闭环。

**Tech Stack:** Node.js、Express、better-sqlite3、node:test、原生 HTML/CSS/JavaScript

---

### Task 1: 定义 staging 数据模型与测试数据库入口

**Files:**
- Modify: `backend/db.js`
- Create: `backend/test/helpers/test-db.js`
- Test: `backend/test/admin-db.test.js`

- [ ] **Step 1: 写失败测试，断言初始化数据库后存在 `import_jobs`、`import_items`、`source_records`、`categories`、`tags`、`novel_aliases` 表与必要索引**

```js
test('db 初始化应创建后台导入相关表', () => {
  const db = createTestDb();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  assert.ok(tables.some((table) => table.name === 'import_jobs'));
});
```

- [ ] **Step 2: 运行 `node --test backend/test/admin-db.test.js`，确认失败**

Run: `node --test backend/test/admin-db.test.js`
Expected: FAIL，提示缺少后台导入表或测试辅助不存在

- [ ] **Step 3: 在 `backend/test/helpers/test-db.js` 建立测试数据库工厂，允许通过临时 `DB_PATH` 初始化隔离 SQLite 文件**

- [ ] **Step 4: 在 `backend/db.js` 为 staging 表、分类表、标签表、别名表与索引补齐最小 schema**

- [ ] **Step 5: 重新运行 `node --test backend/test/admin-db.test.js`，确认通过**

- [ ] **Step 6: 提交数据库 schema 变更**

```bash
git add backend/db.js backend/test/helpers/test-db.js backend/test/admin-db.test.js
git commit -m "feat: add content import staging schema"
```

### Task 2: 抽出后台导入领域纯函数

**Files:**
- Create: `backend/admin/import-utils.js`
- Test: `backend/test/import-utils.test.js`

- [ ] **Step 1: 写失败测试，覆盖状态常量、书名标准化、分类规则命中、重复评分和失败原因规范化**

```js
test('normalizeTitle 应移除常见盗版站噪音词', () => {
  assert.equal(normalizeTitle('万相之王 最新章节 无弹窗'), '万相之王');
});
```

- [ ] **Step 2: 运行 `node --test backend/test/import-utils.test.js`，确认失败**

Run: `node --test backend/test/import-utils.test.js`
Expected: FAIL，提示 `backend/admin/import-utils.js` 不存在或导出缺失

- [ ] **Step 3: 在 `backend/admin/import-utils.js` 实现纯函数**
需要包含：
- `IMPORT_ITEM_STATUS`
- `normalizeTitle(input)`
- `suggestClassification({ sourceCategory, title, intro })`
- `scoreDuplicateCandidate({ importedItem, existingNovel })`
- `summarizeFailureReason(code, detail)`

- [ ] **Step 4: 保持规则逻辑最小可用，只支持 spec 中明确的来源映射、关键词命中和分数分档**

- [ ] **Step 5: 重新运行 `node --test backend/test/import-utils.test.js`，确认通过**

- [ ] **Step 6: 提交纯函数与测试**

```bash
git add backend/admin/import-utils.js backend/test/import-utils.test.js
git commit -m "feat: add import classification and duplicate utils"
```

### Task 3: 实现 staging 仓储与批量上架服务

**Files:**
- Create: `backend/admin/import-repository.js`
- Create: `backend/admin/publish-service.js`
- Test: `backend/test/import-repository.test.js`
- Test: `backend/test/publish-service.test.js`

- [ ] **Step 1: 写失败测试，覆盖创建导入任务、创建导入条目、状态更新、按状态分页查询、记录疑似重复候选**

```js
test('createImportJob 应返回新建任务 ID 并初始化计数', () => {
  const repo = createImportRepository(createTestDb());
  const job = repo.createImportJob({ sourceName: 'biquge', inputType: 'html_zip' });
  assert.equal(job.totalCount, 0);
});
```

- [ ] **Step 2: 写失败测试，覆盖“从 staging 发布到正式书库”行为**
需要断言：
- 新建 `novels`
- 写入 `chapters`
- 补充 `novel_aliases`
- 更新 `import_items.status` 为 `published`

- [ ] **Step 3: 运行 `node --test backend/test/import-repository.test.js backend/test/publish-service.test.js`，确认失败**

Run: `node --test backend/test/import-repository.test.js backend/test/publish-service.test.js`
Expected: FAIL，提示仓储或发布服务不存在

- [ ] **Step 4: 在 `backend/admin/import-repository.js` 实现数据库访问层，避免把 SQL 直接散落进路由**

- [ ] **Step 5: 在 `backend/admin/publish-service.js` 实现事务化上架逻辑，保证正式表与 staging 状态同步更新**

- [ ] **Step 6: 重新运行两组测试，确认通过**

- [ ] **Step 7: 提交仓储与上架服务**

```bash
git add backend/admin/import-repository.js backend/admin/publish-service.js backend/test/import-repository.test.js backend/test/publish-service.test.js
git commit -m "feat: add import repository and publish service"
```

### Task 4: 实现后台管理 API

**Files:**
- Create: `backend/routes/admin.js`
- Modify: `backend/server.js`
- Test: `backend/test/admin-routes.test.js`

- [ ] **Step 1: 写失败测试，覆盖以下最小 API：**
- `GET /api/admin/dashboard`
- `POST /api/admin/import-jobs`
- `GET /api/admin/import-items`
- `POST /api/admin/import-items/:id/classify`
- `POST /api/admin/import-items/:id/duplicate-decision`
- `POST /api/admin/import-items/:id/publish`

- [ ] **Step 2: 在测试里显式断言后台路由当前无鉴权保护的风险，先按单人后台实现，但保留后续接管理员鉴权的入口**

- [ ] **Step 3: 运行 `node --test backend/test/admin-routes.test.js`，确认失败**

Run: `node --test backend/test/admin-routes.test.js`
Expected: FAIL，提示路由未挂载或响应结构不匹配

- [ ] **Step 4: 在 `backend/routes/admin.js` 只组合仓储与服务，不直接实现复杂规则**
接口至少返回：
- 工作台统计
- 导入任务列表
- 待处理书目列表与筛选
- 分类提交结果
- 重复审核决策结果
- 单本上架结果

- [ ] **Step 5: 在 `backend/server.js` 挂载 `require('./routes/admin')`**

- [ ] **Step 6: 重新运行 `node --test backend/test/admin-routes.test.js`，确认通过**

- [ ] **Step 7: 提交后台 API**

```bash
git add backend/routes/admin.js backend/server.js backend/test/admin-routes.test.js
git commit -m "feat: add content admin api"
```

### Task 5: 为 HTML 输入实现最小导入解析器

**Files:**
- Create: `backend/admin/html-import-service.js`
- Test: `backend/test/html-import-service.test.js`

- [ ] **Step 1: 写失败测试，使用最小 HTML fixture 验证能抽出书名、作者、简介、章节数和原始来源字段**

```js
test('parseHtmlImportItem 应从原始 HTML 中抽出基础元数据', () => {
  const parsed = parseHtmlImportItem({ html, sourceUrl: 'https://example.com/book/1' });
  assert.equal(parsed.title, '测试小说');
});
```

- [ ] **Step 2: 运行 `node --test backend/test/html-import-service.test.js`，确认失败**

Run: `node --test backend/test/html-import-service.test.js`
Expected: FAIL，提示 HTML 解析服务不存在

- [ ] **Step 3: 实现最小 HTML 解析策略**
约束：
- 不引入新三方解析库
- 先支持固定规则和简单正则提取
- 提取失败时返回结构化错误码，而不是直接抛裸异常

- [ ] **Step 4: 让解析结果直接复用 Task 2 的分类和失败原因纯函数**

- [ ] **Step 5: 重新运行 `node --test backend/test/html-import-service.test.js`，确认通过**

- [ ] **Step 6: 提交 HTML 导入解析器**

```bash
git add backend/admin/html-import-service.js backend/test/html-import-service.test.js
git commit -m "feat: add html import parser"
```

### Task 6: 实现后台工作台页面

**Files:**
- Create: `frontend/admin.html`
- Modify: `frontend/style.css`

- [ ] **Step 1: 在 `frontend/admin.html` 搭建后台工作台骨架**
必须包含：
- 顶部导航
- 工作台统计卡片
- 导入任务表单
- 待处理书库列表
- 分类处理区
- 重复审核区
- 状态消息区

- [ ] **Step 2: 在页面脚本中添加最小 API 客户端与渲染函数**
需要包含：
- `loadDashboard()`
- `createImportJob()`
- `loadImportItems(filters)`
- `submitClassification(itemId)`
- `submitDuplicateDecision(itemId)`
- `publishItem(itemId)`

- [ ] **Step 3: 在 `frontend/style.css` 新增后台区域样式，不重写现有前台页面视觉**

- [ ] **Step 4: 用本地浏览器手工打开 `frontend/admin.html`，确认布局能在桌面端使用**

- [ ] **Step 5: 提交后台工作台页面**

```bash
git add frontend/admin.html frontend/style.css
git commit -m "feat: add admin content dashboard"
```

### Task 7: 串联端到端最小闭环

**Files:**
- Modify: `backend/routes/admin.js`
- Modify: `backend/admin/import-repository.js`
- Modify: `backend/admin/publish-service.js`
- Modify: `frontend/admin.html`
- Test: `backend/test/admin-workflow.test.js`

- [ ] **Step 1: 写失败测试，覆盖单本流程：创建任务 -> 写入导入条目 -> 分类 -> 标记重复决策 -> 发布**

```js
test('后台工作流应支持单本导入到发布闭环', async () => {
  const result = await runWorkflow();
  assert.equal(result.finalStatus, 'published');
});
```

- [ ] **Step 2: 运行 `node --test backend/test/admin-workflow.test.js`，确认失败**

Run: `node --test backend/test/admin-workflow.test.js`
Expected: FAIL，提示状态流转不完整或数据未同步到正式书库

- [ ] **Step 3: 只做让测试通过所需的最小改动，避免在第一阶段引入批量 ZIP 解析和复杂审核历史**

- [ ] **Step 4: 重新运行 `node --test backend/test/admin-workflow.test.js`，确认通过**

- [ ] **Step 5: 提交闭环联调修正**

```bash
git add backend/routes/admin.js backend/admin/import-repository.js backend/admin/publish-service.js frontend/admin.html backend/test/admin-workflow.test.js
git commit -m "feat: complete content import workflow"
```

### Task 8: 完整验证与文档补充

**Files:**
- Modify: `README.md`
- Modify: `QUICK_REFERENCE.md`

- [ ] **Step 1: 运行后台相关全部测试**

Run: `node --test backend/test/admin-db.test.js backend/test/import-utils.test.js backend/test/import-repository.test.js backend/test/publish-service.test.js backend/test/admin-routes.test.js backend/test/html-import-service.test.js backend/test/admin-workflow.test.js`
Expected: 全部 PASS

- [ ] **Step 2: 启动服务并手工验证后台页面**

Run: `JWT_SECRET=test-secret node backend/server.js`
Expected: 服务启动，`/api/health` 返回 `status: ok`

- [ ] **Step 3: 补充 README 与快捷参考，记录后台入口、最小导入格式和测试命令**

- [ ] **Step 4: 运行一次最终冒烟检查，确认现有前台首页和小说列表未被后台改动破坏**

- [ ] **Step 5: 提交文档与验证收尾**

```bash
git add README.md QUICK_REFERENCE.md
git commit -m "docs: add content admin usage notes"
```

## 备注

- 该计划默认继续在现有工作区执行；如果后续需要严格隔离实现改动，再单独切到专用 worktree。
- `backend/package.json` 当前已有与笔趣阁导出相关的未提交改动；执行本计划时不要覆盖或回退这些变更。
- `backend/routes/admin.js` 第一阶段可先不接真正管理员鉴权，但必须把鉴权接入点留清楚，避免以后重构 API 边界。
- 若 HTML 来源结构差异过大，优先把解析器设计成按站点注册规则，而不是在单个函数里堆叠越来越多的正则。

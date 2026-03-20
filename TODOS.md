# TODOS

## Backend

### 支付集成 — 真实支付系统

**What:** 用真实支付网关（微信支付/支付宝）替换当前的模拟支付逻辑。

**Why:** 当前 `purchase-membership` 路由自动完成订单，硬编码 30元/月，没有真实支付流程。上线后无法收取 VIP 费用。

**Context:** `server.js` 中的 `POST /api/purchase-membership` 直接将订单标记为 completed，没有调用任何支付 API。需要集成微信支付或支付宝 SDK，添加支付回调验证，处理支付失败和退款。订单表 (`orders`) 已有 `status` 字段，可复用。

**Effort:** L
**Priority:** P2
**Depends on:** 用户验证（已有 JWT auth）

### PostgreSQL 迁移

**What:** 当 SQLite 达到并发/规模瓶颈时，迁移到 PostgreSQL。

**Why:** SQLite 单写者锁在高并发下会成为瓶颈。当日活用户超过 ~1000 或需要多实例部署时，需要迁移。

**Context:** 当前使用 better-sqlite3，同步 API。迁移需要：将 `db.js` 改为异步 API（pg/node-postgres），更新所有 `.get()/.run()/.all()` 调用，Docker Compose 添加 PostgreSQL 服务，数据迁移脚本。建议在 DAU 接近 500 时开始规划。

**Effort:** L
**Priority:** P3
**Depends on:** None

## Tools

### 导入工具支持多种章节格式

**What:** `import-novel.js` 支持更多章节分割格式，不仅限于 `第X章：` 模式。

**Why:** 当前 `db.js` 的章节分割正则 `/第[一二三四五六七八九十百千万\d]+章[：:]\s*(.+?)/` 只匹配一种格式。很多小说使用 `Chapter X`、`卷X`、`第X回`、纯数字编号等格式。

**Context:** 导入工具（待创建的 `import-novel.js`）需要支持：`第X回`（古典小说）、`卷X 章X`（多卷结构）、`Chapter X`（翻译小说）、空行分隔（无章节标题）、自定义正则（用户指定）。可以用 `--format` 参数让用户选择分割策略。

**Effort:** M
**Priority:** P2
**Depends on:** import-novel.js 基础版本完成

# Biquge 章节正文 CDN 迁移设计

日期：2026-03-25

## 背景

当前章节正文读取依赖本地文件：

- `chapters.content_file_path` 指向 `storage/json/biquge/chapters/<bookId>/<chapterNumber>.json`
- 运行时由 `backend/chapter-content.js` 直接读取本地磁盘

这导致部署必须 `rsync storage`，并持续占用本地磁盘（当前 `chapters` 约 11GB）。

## 目标

1. 章节正文 JSON 通过 `https://aixs.us.ci/upload` 批量上传到 TG/CF CDN（每批最多 10 个文件）
2. 数据库为每章保存 `content_cdn_url`
3. 运行时优先从 CDN 读取正文，不再依赖本地 `storage/json/biquge/chapters`
4. 上传成功并写库成功后，立即删除本地章节 JSON 释放磁盘
5. 支持断点续跑与失败重试

## 非目标

- 不改现有抓取逻辑（`apiqu-range-export/retry`）
- 不把正文写回数据库 `chapters.content`
- 不在本次实现中重构 Telegraph-Image 服务端

## 方案选型

采用“新增字段 + 双读过渡 + 迁移脚本”方案：

- 新增 `chapters.content_cdn_url` 字段
- 读取链路：优先 `content_cdn_url`，回退 `content_file_path`
- 迁移脚本：扫描本地章节 -> 每批 10 个上传 -> 更新 DB -> 立即删本地文件

相比直接覆写 `content_file_path` 为 URL，这个方案更可维护、可回滚。

## 数据模型

`chapters` 新增列：

- `content_cdn_url TEXT`

语义：章节正文 JSON 的 CDN 绝对 URL，例如：

`https://aixs.us.ci/file/AgAC...json`

## 读取链路

`loadChapterContent(chapter)` 读取顺序：

1. 若 `chapter.content_cdn_url` 存在：HTTP 获取 CDN JSON，解析后取 `content`
2. 若 CDN 失败且存在 `content_file_path`：回退本地文件读取（迁移期兜底）
3. 若都不可用：抛出明确错误

缓存策略沿用现有 TTL 缓存，键从“文件路径”扩展为“来源（cdn/local）+标识”。

## 迁移脚本

新增 `backend/upload-biquge-chapter-cdn.js`，支持：

- `--root`：默认 `storage/json/biquge`
- `--endpoint`：默认空，必填后才真正上传
- `--map-file`：默认 `storage/json/biquge/chapter-cdn-map.json`
- `--limit`：限制处理文件数
- `--batch-size`：默认 10
- `--batch-rate-ms`：批次节流
- `--start-book/--end-book`：按 bookId 范围跑
- `--delete-local`：上传+写库+写映射成功后删除本地文件（本次默认启用）

迁移流程（单批）：

1. 读取本地章节 JSON 文件列表
2. 跳过已在 map 中成功记录的条目
3. 每 10 个文件上传
4. 解析返回 URL，并按 `bookId/chapterNumber` 更新 `chapters.content_cdn_url`
5. map 落盘
6. 删除对应本地 JSON

删除必须在第 4、5 步都成功后执行，避免“删了但没写库/没记账”。

## 映射文件

`chapter-cdn-map.json` 结构：

```json
{
  "2530/1.json": "https://aixs.us.ci/file/xxx.json",
  "2530/2.json": "https://aixs.us.ci/file/yyy.json"
}
```

键使用相对 `chapters` 根的稳定路径，便于断点续跑和审计。

## 容错与恢复

- 单批失败：记录失败项，继续后续批次
- 限流：识别 `retry after` 自动退避
- 重跑：已在 map 的文件直接跳过
- DB 更新失败：该批不删本地文件

## 验收标准

1. `chapters.content_cdn_url` 已上线并可查询
2. `loadChapterContent` 能从 CDN 正常读取
3. 小样本迁移后，本地 JSON 被删除但章节仍可读
4. 全量迁移可持续运行，支持中断重跑
5. 部署时不再需要 `rsync storage`（至少对 `covers` 与 `chapters`）

## 用法示例

```bash
# 1) 小样本迁移 1000 章（每批10）
node backend/upload-biquge-chapter-cdn.js \
  --root storage/json/biquge \
  --endpoint https://aixs.us.ci/upload \
  --limit 1000 \
  --batch-size 10 \
  --delete-local

# 2) 按 bookId 区间持续迁移
node backend/upload-biquge-chapter-cdn.js \
  --root storage/json/biquge \
  --endpoint https://aixs.us.ci/upload \
  --start-book 1 \
  --end-book 50000 \
  --batch-size 10 \
  --delete-local
```

# Telegraph 批量上传与封面 CDN 迁移设计

日期：2026-03-24

## 背景

当前 `Telegraph-Image` 的上传链路是单文件模式：

- 前端上传控件不支持 `multiple`
- 后端 `functions/upload.js` 只读取 `formData.get('file')`
- 成功返回只有一个 `src`

这不适合当前项目的两个目标：

1. 将 `storage/json/biquge/covers/*.jpg` 这批本地封面迁移到 Telegram + Cloudflare Pages CDN
2. 后续复用同一条链路上传正文 `json`、视频和其他静态文件，减轻自有 VPS 存储压力

## 目标

本次改造要同时满足下面两类需求：

- 图床侧支持“单次最多 10 个文件”的批量上传
- 站点数据侧支持批量上传 `biquge` 第一批封面并回写 CDN 地址

验收结果应包括：

- `Telegraph-Image` 支持最多 10 个文件批量上传
- 上传成功后返回多个 URL，而不是单个 URL
- 图片/视频优先利用 Telegram `sendMediaGroup`
- 普通文件也能批量上传
- `storage/json/biquge/books/*.json` 中的 `cover` 对象新增 `cdnUrl`
- 迁移过程生成可复跑的映射清单，避免重复上传

## 非目标

本次不做下面这些事情：

- 不改现有 `all` / `biquge2` / `biquge3` 等批次正文抓取逻辑
- 不直接删除本地封面文件
- 不把书级 JSON 中的 `localPath` 强制替换掉
- 不一次性上传正文内容到图床，只先把链路做成可复用

## 方案对比

### 方案一：只做封面单用途迁移

- 只支持图片批量上传
- 只处理 `biquge` 封面目录

优点：

- 改动最少

缺点：

- 后续上传正文 `json` 还要再做一套

### 方案二：做通用批量上传器

- 图床支持最多 10 个任意文件
- 媒体类优先用 `sendMediaGroup`
- 非媒体类按单文件循环上传后聚合返回
- 本项目侧加通用批量迁移脚本，本次先拿来迁移封面

优点：

- 一次改完，后续封面、正文 `json`、视频都能复用

缺点：

- 比单用途方案多一点接口和返回结构设计

### 方案三：完全不改图床，客户端逐个上传

优点：

- 不需要改远端服务

缺点：

- 请求数高
- 体验差
- 无法满足“一个请求拿回多个 URL”的目标

## 选型

采用方案二。

原因：

- 这是长期可复用的基础设施，不应该只服务一批封面
- `sendMediaGroup` 允许一次上传 `2-10` 个媒体，适合图片/视频批量场景
- 普通文件可以回退到逐个上传聚合结果，不阻塞通用性

## 整体设计

改造分成两部分：

1. `Telegraph-Image` 仓库增加批量上传能力
2. 当前项目新增一个批量上传并回写 JSON 的迁移脚本

### 1. Telegraph-Image 改造

#### 前端

- 上传控件添加 `multiple`
- 单次最多选择 10 个文件
- 成功态由单 URL 输入框改成 URL 列表
- 保留单文件上传兼容行为

#### 后端

`functions/upload.js` 从单文件模式改为统一批量入口：

- 用 `formData.getAll('file')` 读取所有文件
- 校验文件数为 `1-10`
- 根据文件集合自动选择上传策略

上传策略：

- 单文件：沿用现有单文件上传逻辑
- 全部为图片或视频，且数量在 `2-10`：使用 Telegram `sendMediaGroup`
- 其他情况：逐个调用单文件上传逻辑，再聚合返回

返回结构统一为数组：

```json
[
  {
    "src": "/file/abc.jpg",
    "fileName": "10013.jpg",
    "mimeType": "image/jpeg"
  }
]
```

#### KV 记录

每个成功上传的文件仍然独立写一条 KV 记录，保持与现有 `/file/<id>.<ext>` 读取链路兼容。

这意味着即使一次上传 10 个文件，最终也会得到 10 条可单独访问的 CDN URL。

### 2. 当前项目迁移脚本

新增一个批量上传脚本，职责是：

- 扫描指定目录文件
- 分批调用图床上传接口
- 产出本地映射清单
- 按映射结果回写 `books/*.json`

本次先处理：

- 输入目录：`storage/json/biquge/covers`
- 输出映射：`storage/json/biquge/cover-cdn-map.json`
- 回写目录：`storage/json/biquge/books`

### 3. 书级 JSON 回写规则

保留现有 `cover.originalUrl` 和 `cover.localPath`，新增：

```json
"cover": {
  "originalUrl": "https://www.bqg291.cc/bookimg/0/557.jpg",
  "localPath": "storage/json/biquge/covers/557.jpg",
  "cdnUrl": "https://aixs.us.ci/file/xxxxx.jpg"
}
```

这样后续站点端可以优先使用 `cdnUrl`，但本地文件仍可作为回滚兜底。

## 文件设计

### Telegraph-Image 仓库

建议修改：

- `functions/upload.js`
  - 拆成“批量入口 + 单文件上传 + media group 上传 + 返回格式化”
- 前端上传页相关文件
  - 增加 `multiple`
  - 增加 10 文件限制
  - 成功态渲染多 URL 列表

### 当前项目

建议新增：

- `backend/upload-telegraph-batch.js`
  - 通用批量上传器
- `backend/update-biquge-cover-cdn.js`
  - 根据映射表回写 `biquge/books/*.json`
- `backend/test/upload-telegraph-batch.test.js`
- `backend/test/update-biquge-cover-cdn.test.js`

如果实现时发现职责可以合并，也可以把“上传 + 回写”放在一个 CLI 中，但内部仍应拆分成独立函数以便测试。

## 数据流

### 图床批量上传

1. 用户或脚本提交 `1-10` 个文件到 `/upload`
2. 后端识别文件集合类型
3. 媒体组走 `sendMediaGroup`，其他走逐个上传
4. 提取每个文件的 `file_id`
5. 为每个文件写 KV 记录
6. 返回 URL 数组

### 封面迁移

1. 脚本扫描 `storage/json/biquge/covers`
2. 按 10 个一组上传
3. 记录 `bookId -> cdnUrl`
4. 将映射落盘到 `cover-cdn-map.json`
5. 回写对应 `books/<bookId>.json`

## 错误处理

### 图床侧

- 超过 10 个文件直接返回 `400`
- 空请求直接返回 `400`
- `sendMediaGroup` 失败时，整组回退为逐文件上传
- 单文件失败时保留明确错误信息，便于脚本重试

### 项目侧

- 上传脚本支持跳过已存在映射
- 单组失败写入错误文件，不中断整批任务
- 回写前校验文件名与 `bookId` 是否一致
- 回写只追加 `cover.cdnUrl`，不修改其他字段

## 测试策略

### Telegraph-Image

- 单文件上传仍返回数组，长度为 `1`
- 2 到 10 张图片走媒体组并返回多个结果
- 混合类型文件回退到逐个上传
- 超过 10 个文件报错

### 当前项目

- 目录扫描与按 10 个分组
- 上传结果正确映射到 `bookId`
- 重跑时跳过已有映射
- `books/*.json` 正确新增 `cover.cdnUrl`

## 风险与约束

- Telegram `sendMediaGroup` 只适用于媒体类，不适合任意文件混发
- 图床部署端仍受 Telegram Bot API 文件大小限制
- `Cloudflare KV` 免费额度较低，开启管理功能时要关注写配额
- 封面迁移后，站点端需要显式优先读取 `cover.cdnUrl`

## 验收标准

满足以下条件即可验收：

- `Telegraph-Image` 可单次上传最多 10 个文件
- 图片/视频批量上传后返回多个 URL
- 任意文件批量上传可正常回退并返回多个 URL
- `storage/json/biquge/cover-cdn-map.json` 成功生成
- `storage/json/biquge/books/*.json` 中出现 `cover.cdnUrl`
- 第一批 `biquge` 封面迁移脚本支持断点续跑

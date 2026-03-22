# Bige7 全站 JSON 导出设计

日期：2026-03-22

## 背景

现有项目已经具备一套针对 `0732.bqg291.cc` 的小说导出脚本，能够批量抓取书目、目录、封面与正文，并将数据落盘到 `storage/json/biquge`。

新的目标站点为 `https://www.bige7.com/`。用户要求：

- 抓取全站而非单一榜单
- 输出目录改为 `storage/json/bige7`
- 数据结构沿用现有方案
- 抓取范围包含书目、分类、封面、完整目录、全部正文
- 正文仍通过 `https://apibi.cc/api` 获取
- 最终数据集中必须包含《仙逆》和《异世之风流大法师》

初步探测表明 `www.bige7.com` 存在 TLS 证书主机名不匹配问题，因此抓取层需要支持该站点的“跳过证书校验”访问策略。

## 目标

在不复制整套抓取逻辑的前提下，将现有导出器改造成“多站点参数化”的实现，新增 `bige7` 站点配置并支持：

- 全站枚举书籍
- 下载封面
- 导出每本书 JSON
- 导出每章正文 JSON
- 断点续跑
- 失败章节定向补抓

## 非目标

- 不改现有 JSON 导入数据库逻辑
- 不改现有 `biquge` 数据目录结构
- 不引入浏览器自动化
- 不处理站点登录、验证码、动态签名

## 已确认约束

1. `www.bige7.com` HTTPS 证书与域名不匹配，HTTP 客户端必须允许按主机名单独关闭证书校验。
2. 正文来源仍为 `https://apibi.cc/api/chapter?id=<bookId>&chapterid=<chapterNumber>`。
3. 用户要求与上次相同的数据落盘结构：
   - `storage/json/bige7/index.json`
   - `storage/json/bige7/books/<bookId>.json`
   - `storage/json/bige7/covers/<bookId>.jpg`
   - `storage/json/bige7/chapters/<bookId>/<chapterNumber>.json`

## 方案对比

### 方案 1：参数化现有抓取器并新增站点配置

做法：

- 将现有 `biquge-export.js` 里的站点常量改为可配置目标
- 抽出站点配置表，按目标站点选择：
  - 站点根域名
  - 封面域名
  - 分类入口列表
  - 输出目录
  - 需要跳过证书校验的主机名
- 保留当前的目录导出、正文导出、错误日志和断点续跑机制

优点：

- 复用现有测试和抓取能力，改动集中
- 后续再接新站时只需补配置，不用复制脚本
- `retry` 脚本也能跟着共享同一套目标参数

缺点：

- 需要整理当前偏单站写死的实现

### 方案 2：复制一套 `bige7` 专用抓取器

优点：

- 上线快，短期隔离

缺点：

- 两套脚本后续必然漂移
- 修 bug、补参数、扩站点要做两遍

## 结论

采用方案 1：将现有抓取器参数化，新增 `bige7` 站点配置。

## 目标数据结构

### 书级索引

`storage/json/bige7/index.json`

包含：

- `site`
- `chapterApiHost`
- `source`
- `categories`
- `fetchedAt`
- `requestedLimit`
- `successCount`
- `errorCount`
- `books`

### 单书 JSON

`storage/json/bige7/books/<bookId>.json`

包含：

- 基础元数据：书名、作者、分类、状态、简介、最后更新时间
- 最后章节信息
- 封面原始 URL 和本地路径
- 章节目录
- 章节总数
- 抓取时间

### 单章 JSON

`storage/json/bige7/chapters/<bookId>/<chapterNumber>.json`

包含：

- 站点信息
- 正文接口信息
- 书 ID、章节号、章节标题
- 原始阅读 URL
- 正文 API URL
- 合并后的正文内容
- 抓取时间

## 代码设计

### 1. 站点配置表

新增一个站点目标配置层，至少支持：

- `biquge`
- `bige7`

配置字段建议：

- `name`
- `site`
- `imageHost`
- `chapterApiHost`
- `outputDir`
- `categories`
- `insecureHosts`

默认目标仍保持现有 `biquge`，以避免破坏现有命令。

### 2. 参数扩展

抓取器新增目标站点参数，例如：

- `--target biquge`
- `--target bige7`

如果传入 `--target bige7`，则自动切换到：

- `https://www.bige7.com`
- `storage/json/bige7`
- `bige7` 对应分类列表

### 3. URL 构造函数参数化

现有这些函数要改为基于 `options` 或 `targetConfig`：

- `buildCoverUrl`
- `buildChapterUrl`
- `buildChapterApiUrl`
- `buildRequestHeaders`

### 4. TLS 兼容

`requestBuffer()` 的 `rejectUnauthorized` 逻辑需要从“全局常量集合”切换为“当前目标站点允许的 insecure host 集合”，以兼容 `www.bige7.com`。

封面下载的 `curl -k -L` 路径保留。

### 5. 全站枚举

继续沿用“分类接口合并 + 按书 ID 去重”的方式。

对于 `bige7`，需先探测其分类入口是否与 `biquge` 保持一致；若不一致，则将 `bige7` 分类列表写入目标配置。

### 6. 重试脚本复用

`biquge-retry-chapter-errors.js` 也要同步支持 `--target`，避免它只能补 `storage/json/biquge`。

### 7. 输出一致性

脚本执行完成后，需确保：

- `books/*.json` 文件数与索引书数一致
- `chapter-errors.json` 与实际缺口一致
- `chapter-index.json` 与当前目标目录一致

## 测试设计

优先补单元测试，不直接改生产代码：

1. `parseArgs()` 支持 `--target bige7`
2. `buildCoverUrl()` 和 `buildChapterUrl()` 能按目标站切换
3. 站点配置解析正确
4. `retry` 脚本支持 `--target bige7`

## 执行策略

第一阶段：

- 改造抓取器为多站点参数化
- 增加单元测试
- 用 `--target bige7 --limit 1 --with-content` 做冒烟验证

第二阶段：

- 跑 `--target bige7 --all-categories`
- 确认 `books`、`covers`、`index` 正常

第三阶段：

- 跑 `--target bige7 --all-categories --with-content`
- 若有失败，使用重试脚本定向补齐

## 硬性验收条件

除常规文件数量与错误日志校验外，还必须额外验证以下作品存在于最终输出中：

- 《仙逆》
- 《异世之风流大法师》

验证口径：

- `books/*.json` 中能按书名找到对应作品
- 对应作品存在章节目录
- 对应作品至少抽查 1 个章节正文文件存在

## 风险

1. `bige7` 的分类接口命名可能与现有站不同，需要实测。
2. `bige7` 的封面域名路径可能不同，需要实测封面 URL 规则。
3. `apibi.cc` 仍可能出现超时，必须保留失败重试。
4. 站点书目数量可能比上次更大，长任务应默认支持断点续跑。

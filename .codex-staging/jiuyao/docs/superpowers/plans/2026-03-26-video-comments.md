# Video Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `/var/zip/jiuyao/_by_id` 下的全部视频生成对应评论 JSON，并输出到 `/var/zip/jiuyao/comments`。

**Architecture:** 使用一个可断点续跑的 Node.js 抓取脚本读取现有视频元数据，按 `commentCount` 决定是否请求评论接口。评论抓取复用昨天已经验证过的登录、参数加密、响应解密和 `4010` 自动重登策略，并将主评论与二级回复统一整理后落盘。

**Tech Stack:** Node.js 24、内置 `node:test`、`curl`、JSON 文件落盘

---

### Task 1: 核心纯逻辑

**Files:**
- Create: `lib/comment_export_core.js`
- Test: `tests/comment_export_core.test.js`

- [ ] **Step 1: 写失败测试**

覆盖以下行为：

- `commentCount > 0` 时返回需要抓取
- 主评论请求参数固定带 `objID`、`objType`、`curTime`、`pageNumber`、`pageSize`
- 二级回复请求参数固定带 `objID`、`cmtId`、`fstID`
- 回复合并时按 `id` 去重
- 空评论文件结构正确

- [ ] **Step 2: 运行测试确认失败**

Run: `/Users/ivan/.nvm/versions/node/v24.14.0/bin/node --test tests/comment_export_core.test.js`

- [ ] **Step 3: 写最小实现**

实现纯函数，不接网络：

- 是否需要抓评论
- 主评论参数构建
- 二级回复参数构建
- 回复去重合并
- 空评论输出构建

- [ ] **Step 4: 运行测试确认通过**

Run: `/Users/ivan/.nvm/versions/node/v24.14.0/bin/node --test tests/comment_export_core.test.js`

- [ ] **Step 5: 跳过提交**

当前目录不是 git 仓库，不执行 commit。

### Task 2: 评论抓取脚本

**Files:**
- Create: `comment_export.js`
- Modify: `lib/comment_export_core.js`

- [ ] **Step 1: 接入登录与 API 客户端**

复用昨天视频抓取脚本中的：

- 登录
- AES 参数加密
- hash 响应解密
- `4010` 自动重登

- [ ] **Step 2: 接入评论抓取流程**

实现：

- 遍历视频文件
- 仅对 `commentCount > 0` 的视频请求 `/comment/list`
- 对需要补抓的主评论请求 `/comment/info`
- 生成单视频输出

- [ ] **Step 3: 接入断点续跑与错误落盘**

实现：

- 已成功文件跳过
- `_summary.json` 周期性刷新
- `_errors.ndjson` 记录失败项

- [ ] **Step 4: 样本运行验证**

Run: `OUT_DIR=/var/zip/jiuyao/comments ONLY_IDS=67cc03de1564603015afe898,614758e5a871e78d083cfd80 /Users/ivan/.nvm/versions/node/v24.14.0/bin/node comment_export.js`

期望：

- 生成两个样本文件
- 一个命中真实评论抓取
- 一个命中空评论输出

### Task 3: 全量运行

**Files:**
- Modify: `/var/zip/jiuyao/comments/_summary.json`
- Create: `/var/zip/jiuyao/comments/_by_id/*.json`
- Create: `/var/zip/jiuyao/comments/_errors.ndjson`

- [ ] **Step 1: 启动全量抓取**

Run: `OUT_DIR=/var/zip/jiuyao/comments /Users/ivan/.nvm/versions/node/v24.14.0/bin/node comment_export.js`

- [ ] **Step 2: 监控进度与异常**

观察：

- 已处理视频数
- 成功抓取数
- 空评论跳过数
- `4010` 重登次数

- [ ] **Step 3: 收尾校验**

检查：

- `_summary.json`
- `_errors.ndjson`
- `comments/_by_id` 文件数

- [ ] **Step 4: 跳过提交**

当前目录不是 git 仓库，不执行 commit。

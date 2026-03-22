# Biquge Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Node.js 抓取脚本，从笔趣阁站点导出最新更新的 100 本小说到 `storage/json/biquge`

**Architecture:** 使用站点已暴露的 JSON 接口而不是 HTML 解析。脚本拆成可测试的纯函数与少量 I/O 逻辑，先验证数据转换，再执行真实抓取与落盘。

**Tech Stack:** Node.js 24、内置 fetch、node:test、fs/promises

---

### Task 1: 建立抓取测试

**Files:**
- Create: `backend/test/biquge-export.test.js`

- [ ] **Step 1: 写 URL 与数据转换失败测试**
- [ ] **Step 2: 运行 `node --test backend/test/biquge-export.test.js`，确认失败**
- [ ] **Step 3: 保持测试断言聚焦在封面 URL、章节 URL、详情规范化**

### Task 2: 实现抓取脚本

**Files:**
- Create: `backend/biquge-export.js`

- [ ] **Step 1: 实现可测试纯函数**
- [ ] **Step 2: 实现接口请求与超时控制**
- [ ] **Step 3: 实现单书抓取、封面下载、JSON 落盘**
- [ ] **Step 4: 实现批量导出 CLI**
- [ ] **Step 5: 为脚本添加中文注释与使用示例**

### Task 3: 接入运行命令

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: 添加测试命令**
- [ ] **Step 2: 添加导出命令**

### Task 4: 本地验证

**Files:**
- No file changes required

- [ ] **Step 1: 跑测试，确认通过**
- [ ] **Step 2: 先执行 `--limit 1` 进行冒烟验证**
- [ ] **Step 3: 再执行 `--limit 100` 进行完整抓取**
- [ ] **Step 4: 检查 `storage/json/biquge/index.json`、`books/`、`covers/`、`errors.json`**

# Telegraph 批量上传与封面 CDN 迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `Telegraph-Image` 增加最多 10 个文件的批量上传能力，并为 `storage/json/biquge` 第一批封面生成可复跑的 CDN 迁移链路。

**Architecture:** 图床端将 `/upload` 改造成统一批量入口，媒体类优先使用 Telegram `sendMediaGroup`，其余文件回退到逐个上传并聚合返回。当前项目新增批量上传 CLI 和 JSON 回写逻辑，将 `biquge/books/*.json` 的 `cover` 字段补充 `cdnUrl`。

**Tech Stack:** Node.js、Cloudflare Pages Functions、Telegram Bot API、JSON 文件存储

---

### Task 1: 明确现有封面字段与目标回写格式

**Files:**
- Read: `backend/fix-biquge-cover-paths.js`
- Read: `storage/json/biquge/books/*.json`
- Test: `backend/test/update-biquge-cover-cdn.test.js`

- [ ] **Step 1: 写回写格式测试**

```js
const updated = applyCoverCdn(bookJson, 'https://aixs.us.ci/file/demo.jpg');
assert.equal(updated.cover.cdnUrl, 'https://aixs.us.ci/file/demo.jpg');
assert.equal(updated.cover.localPath, 'storage/json/biquge/covers/557.jpg');
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test backend/test/update-biquge-cover-cdn.test.js`
Expected: FAIL，因为 `applyCoverCdn` 尚不存在

- [ ] **Step 3: 实现最小回写模块**

Create: `backend/update-biquge-cover-cdn.js`

```js
function applyCoverCdn(book, cdnUrl) {
  return {
    ...book,
    cover: {
      ...book.cover,
      cdnUrl,
    },
  };
}
```

- [ ] **Step 4: 再跑测试确认通过**

Run: `node --test backend/test/update-biquge-cover-cdn.test.js`
Expected: PASS

### Task 2: 为 Telegraph-Image 写批量上传失败测试

**Files:**
- Modify: `Telegraph-Image/functions/upload.js`
- Test: `Telegraph-Image/tests/upload-batch.test.js` 或仓库内现有测试目录

- [ ] **Step 1: 写 4 组失败测试**

覆盖：

- 单文件仍返回数组
- 2-10 个图片返回多结果
- 混合文件回退到逐个上传
- 超过 10 个文件返回 400

- [ ] **Step 2: 运行测试确认失败**

Run: 仓库内对应测试命令
Expected: FAIL，因为当前 `upload.js` 只支持单文件

### Task 3: 实现 Telegraph-Image 批量上传后端

**Files:**
- Modify: `Telegraph-Image/functions/upload.js`

- [ ] **Step 1: 提取单文件上传辅助函数**

实现：

- `uploadSingleFile(uploadFile, env)`
- `saveFileRecord(fileId, fileExtension, uploadFile, env)`
- `formatUploadResult(...)`

- [ ] **Step 2: 实现媒体组上传**

实现：

- `uploadMediaGroup(files, env)`
- 仅处理图片/视频
- 调用 Telegram `sendMediaGroup`
- 从 `Message[]` 中提取每个文件的 `file_id`

- [ ] **Step 3: 实现统一批量入口**

实现：

- `formData.getAll('file')`
- 数量校验 `1-10`
- 自动选择 `single` / `mediaGroup` / `multiSingleFallback`

- [ ] **Step 4: 运行测试确认通过**

Run: 仓库内对应测试命令
Expected: PASS

### Task 4: 实现 Telegraph-Image 前端多文件上传

**Files:**
- Modify: `Telegraph-Image` 前端上传页组件文件

- [ ] **Step 1: 写界面交互测试或最小手工验证清单**

验证：

- 支持多选
- 超过 10 个阻止提交
- 成功后显示多条 URL

- [ ] **Step 2: 修改上传控件**

实现：

- 增加 `multiple`
- 限制最大 10 个文件
- 上传前提示超限错误

- [ ] **Step 3: 修改成功态展示**

实现：

- 用 URL 列表替换单输入框
- 保留复制能力

- [ ] **Step 4: 手工验证**

Expected:

- 单文件成功
- 多文件成功
- 页面能看到多个 URL

### Task 5: 为当前项目写通用批量上传器测试

**Files:**
- Create: `backend/test/upload-telegraph-batch.test.js`
- Create: `backend/upload-telegraph-batch.js`

- [ ] **Step 1: 写扫描、分组、映射测试**

覆盖：

- 按文件名排序
- 每组最多 10 个
- 成功返回后生成 `{ bookId: cdnUrl }`
- 已存在映射时跳过

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test backend/test/upload-telegraph-batch.test.js`
Expected: FAIL，因为脚本未实现

- [ ] **Step 3: 实现最小脚本**

实现：

- `scanFiles(dir)`
- `chunkFiles(files, 10)`
- `uploadBatch(files, endpoint)`
- `saveMap(filePath, map)`

- [ ] **Step 4: 再跑测试确认通过**

Run: `node --test backend/test/upload-telegraph-batch.test.js`
Expected: PASS

### Task 6: 实现 biquge 封面迁移与回写

**Files:**
- Modify: `backend/update-biquge-cover-cdn.js`
- Modify: `backend/package.json`

- [ ] **Step 1: 实现 CLI**

支持参数：

- `--root storage/json/biquge`
- `--map-file storage/json/biquge/cover-cdn-map.json`
- `--endpoint https://aixs.us.ci/upload`

- [ ] **Step 2: 回写 `books/*.json`**

规则：

- 依据文件名中的 `bookId`
- 只补 `cover.cdnUrl`
- 保留 `originalUrl` 和 `localPath`

- [ ] **Step 3: 增加 usage 示例**

```bash
node backend/upload-telegraph-batch.js --root storage/json/biquge --endpoint https://aixs.us.ci/upload
node backend/update-biquge-cover-cdn.js --root storage/json/biquge --map-file storage/json/biquge/cover-cdn-map.json
```

- [ ] **Step 4: 运行测试**

Run:

- `node --test backend/test/upload-telegraph-batch.test.js`
- `node --test backend/test/update-biquge-cover-cdn.test.js`

Expected: PASS

### Task 7: 做一次小样本联调

**Files:**
- Read/Write: `storage/json/biquge`

- [ ] **Step 1: 选 10 张封面做冒烟**

Run:

```bash
node backend/upload-telegraph-batch.js --root storage/json/biquge --limit 10 --endpoint https://aixs.us.ci/upload
```

- [ ] **Step 2: 检查映射文件**

Expected:

- `cover-cdn-map.json` 中有 10 条记录

- [ ] **Step 3: 回写 10 本书 JSON**

Run:

```bash
node backend/update-biquge-cover-cdn.js --root storage/json/biquge --map-file storage/json/biquge/cover-cdn-map.json --limit 10
```

- [ ] **Step 4: 抽查结果**

Expected:

- 对应 `books/*.json` 中新增 `cover.cdnUrl`

### Task 8: 跑完整批封面迁移

**Files:**
- Read/Write: `storage/json/biquge`

- [ ] **Step 1: 全量上传封面**

Run:

```bash
node backend/upload-telegraph-batch.js --root storage/json/biquge --endpoint https://aixs.us.ci/upload
```

- [ ] **Step 2: 全量回写书 JSON**

Run:

```bash
node backend/update-biquge-cover-cdn.js --root storage/json/biquge --map-file storage/json/biquge/cover-cdn-map.json
```

- [ ] **Step 3: 统计校验**

Run:

```bash
find storage/json/biquge/books -type f | wc -l
node -e "const fs=require('fs');const path='storage/json/biquge/books';const files=fs.readdirSync(path);let count=0;for(const f of files){const j=JSON.parse(fs.readFileSync(path+'/'+f,'utf8'));if(j.cover&&j.cover.cdnUrl)count++;}console.log(count)"
```

Expected:

- `cover.cdnUrl` 数量与 `books/*.json` 数量一致，或明确列出失败项

### Task 9: 最终验证与文档补充

**Files:**
- Modify: `docs/superpowers/specs/2026-03-24-telegraph-batch-upload-design.md`
- Modify: `backend/package.json`

- [ ] **Step 1: 跑全部相关测试**

Run:

- `node --test backend/test/upload-telegraph-batch.test.js`
- `node --test backend/test/update-biquge-cover-cdn.test.js`
- 当前受影响的既有测试

- [ ] **Step 2: 记录实际使用方式**

在脚本文件头和必要位置补中文注释与 usage 示例。

- [ ] **Step 3: 输出结果摘要**

记录：

- 图床是否支持 10 文件
- 小样本是否成功
- 全量封面迁移是否完成

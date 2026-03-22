# Bige7 全站 JSON 导出实施计划

日期：2026-03-22

我正在使用 `writing-plans` 技能来创建实施计划。

规范文档：`docs/superpowers/specs/2026-03-22-bige7-export-design.md`

## 文件结构

- Modify: `backend/biquge-export.js`
  - 将现有单站脚本改为多站点参数化
  - 新增 `--target` 解析
  - 支持 `bige7` 目标配置
- Modify: `backend/test/biquge-export.test.js`
  - 先补失败测试，再驱动实现
- Modify: `backend/biquge-retry-chapter-errors.js`
  - 让失败章节补抓脚本也支持 `--target`
- Modify: `backend/test/biquge-retry-chapter-errors.test.js`
  - 为 `--target` 和站点配置补单测
- Create/Refresh: `storage/json/bige7`
  - 存放 `bige7` 的导出结果

## 任务 1：为多站点配置写失败测试

- [ ] **Step 1: 在 `backend/test/biquge-export.test.js` 增加 `--target bige7` 解析测试**

```js
test('parseArgs 应该支持 bige7 目标站点', () => {
  const result = parseArgs([
    'node',
    'backend/biquge-export.js',
    '--target',
    'bige7',
    '--all-categories',
  ]);

  assert.equal(result.target.name, 'bige7');
  assert.equal(result.site, 'https://www.bige7.com');
});
```

- [ ] **Step 2: 在 `backend/test/biquge-export.test.js` 增加按目标站切换封面和章节 URL 的测试**

```js
test('buildCoverUrl 和 buildChapterUrl 应该按目标站切换', () => {
  const target = getTargetConfig('bige7');

  assert.equal(
    buildCoverUrl(target, 1234),
    'https://www.bige7.com/bookimg/1/1234.jpg'
  );
  assert.equal(
    buildChapterUrl(target, 1234, 1),
    'https://www.bige7.com/book/1234/1.html'
  );
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node --test backend/test/biquge-export.test.js`

Expected:
- 新增测试失败
- 失败原因是 `--target` 和站点配置尚未实现

## 任务 2：实现抓取器多站点参数化

- [ ] **Step 4: 在 `backend/biquge-export.js` 中新增站点配置表**

```js
const TARGETS = {
  biquge: {
    name: 'biquge',
    site: 'https://0732.bqg291.cc',
    imageHost: 'https://www.bqg291.cc',
    chapterApiHost: 'https://apibi.cc',
    outputDir: path.join(PROJECT_ROOT, 'storage/json/biquge'),
    categories: [...],
    insecureHosts: new Set(['0732.bqg291.cc', 'www.bqg291.cc']),
  },
  bige7: {
    name: 'bige7',
    site: 'https://www.bige7.com',
    imageHost: 'https://www.bige7.com',
    chapterApiHost: 'https://apibi.cc',
    outputDir: path.join(PROJECT_ROOT, 'storage/json/bige7'),
    categories: [...],
    insecureHosts: new Set(['www.bige7.com']),
  },
};
```

- [ ] **Step 5: 增加 `getTargetConfig()` 并让 `parseArgs()` 支持 `--target`**

```js
case '--target':
  options.target = getTargetConfig(args[index + 1] || 'biquge');
  index += 1;
  break;
```

- [ ] **Step 6: 将 URL 构造函数改成依赖目标配置**

```js
function buildCoverUrl(target, bookId) { ... }
function buildChapterUrl(target, bookId, chapterNumber) { ... }
function buildChapterApiUrl(target, bookId, chapterNumber) { ... }
```

- [ ] **Step 7: 将请求头和 TLS 校验切到当前目标配置**

```js
function buildRequestHeaders(target, url) { ... }
rejectUnauthorized: !target.insecureHosts.has(parsedUrl.hostname)
```

- [ ] **Step 8: 让默认输出目录、分类入口、章节 API Host 都从目标配置派生**

Run: `node --test backend/test/biquge-export.test.js`

Expected:
- 现有测试与新增测试全部通过

## 任务 3：为重试脚本写失败测试

- [ ] **Step 9: 在 `backend/test/biquge-retry-chapter-errors.test.js` 增加 `--target bige7` 解析测试**

```js
test('parseArgs 支持 bige7 目标站点', () => {
  const result = parseArgs([
    'node',
    'backend/biquge-retry-chapter-errors.js',
    '--target',
    'bige7',
  ]);

  assert.equal(result.target.name, 'bige7');
});
```

- [ ] **Step 10: 运行测试确认失败**

Run: `node --test backend/test/biquge-retry-chapter-errors.test.js`

Expected:
- 新增测试失败

## 任务 4：实现重试脚本多站点支持

- [ ] **Step 11: 在 `backend/biquge-retry-chapter-errors.js` 中增加与抓取器一致的目标配置解析**

- [ ] **Step 12: 让默认输出目录、站点 URL、章节 API 构造都支持 `--target`**

- [ ] **Step 13: 运行测试确认通过**

Run: `node --test backend/test/biquge-retry-chapter-errors.test.js`

Expected:
- 全部通过

## 任务 5：实测 bige7 接口与封面规则

- [ ] **Step 14: 用 `curl -k -L` 探测 `https://www.bige7.com/api/sort?sort=index`**

Run: `curl -k -L --max-time 20 https://www.bige7.com/api/sort?sort=index`

Expected:
- 返回 JSON 书目列表

- [ ] **Step 15: 验证详情、目录、正文接口**

Run:
- `curl -k -L --max-time 20 'https://www.bige7.com/api/book?id=<bookId>'`
- `curl -k -L --max-time 20 'https://www.bige7.com/api/booklist?id=<bookId>'`
- `curl -L --max-time 20 'https://apibi.cc/api/chapter?id=<bookId>&chapterid=1'`

Expected:
- 能拼出完整导出链路

- [ ] **Step 16: 验证封面地址规则**

Run: `curl -k -I -L --max-time 20 'https://www.bige7.com/bookimg/<floor(id/1000)>/<id>.jpg'`

Expected:
- 返回 `200`

## 任务 6：做 bige7 冒烟导出

- [ ] **Step 17: 先跑 1 本小说的完整导出**

Run: `node backend/biquge-export.js --target bige7 --limit 1 --with-content`

Expected:
- `storage/json/bige7/books` 至少 1 本
- `storage/json/bige7/covers` 至少 1 张
- 对应 `chapters/<bookId>` 有正文文件

- [ ] **Step 18: 校验导出 JSON 结构**

Run:
- `find storage/json/bige7/books -type f | wc -l`
- `find storage/json/bige7/covers -type f | wc -l`
- `find storage/json/bige7/chapters -type f | wc -l`

Expected:
- 全部大于 0

## 任务 7：启动全站导出

- [ ] **Step 19: 先跑全站目录与封面**

Run: `node backend/biquge-export.js --target bige7 --all-categories`

- [ ] **Step 20: 再跑全站正文**

Run: `node backend/biquge-export.js --target bige7 --all-categories --with-content`

- [ ] **Step 21: 若存在缺口，运行定向补抓**

Run:
- `node backend/biquge-retry-chapter-errors.js --target bige7`
- `node backend/biquge-retry-chapter-errors.js --target bige7 --scan-missing`

## 任务 8：验收

- [ ] **Step 22: 验证错误日志为空**

Run:
- `node -e 'const fs=require("fs"); console.log(JSON.parse(fs.readFileSync("storage/json/bige7/chapter-errors.json","utf8")).length)'`

Expected:
- 输出 `0`

- [ ] **Step 23: 验证预期章节数与实际文件数一致**

Run:
- `node -e '/* 汇总 books/*.json 的 chapterCount 与 chapters 文件数并比较 */'`

Expected:
- `missing = 0`

- [ ] **Step 24: 验证《仙逆》和《异世之风流大法师》存在**

Run:
- `rg -n '"title": "仙逆"' storage/json/bige7/books`
- `rg -n '"title": "异世之风流大法师"' storage/json/bige7/books`

Expected:
- 两部作品都能命中
- 对应作品目录下至少有一个章节正文文件

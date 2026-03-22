# 笔趣阁 JSON 导出设计

## 目标

从 `https://0732.bqg291.cc` 抓取首页“最新更新”的前 100 部小说，导出为本地 JSON 数据集，保存到 `./storage/json/biquge`。

第一批范围如下：

- 抓取 100 本小说
- 抓取每本小说的元数据
- 抓取每本小说的完整章节目录
- 下载每本小说的封面图片
- 不抓取章节正文

## 数据来源

站点前端脚本已暴露以下接口：

- `/api/sort?sort=index`
  用于获取首页小说列表，作为“最新更新”批次入口
- `/api/book?id=<bookId>`
  用于获取单本小说详情
- `/api/booklist?id=<dirId>`
  用于获取单本小说完整章节目录

封面图片 URL 规则如下：

- `https://www.bqg291.cc/bookimg/{Math.floor(bookId / 1000)}/{bookId}.jpg`

## 输出结构

- `storage/json/biquge/index.json`
  保存本次批次元数据与小说索引
- `storage/json/biquge/books/<bookId>.json`
  每本小说一个 JSON 文件
- `storage/json/biquge/covers/<bookId>.jpg`
  每本小说一个封面文件
- `storage/json/biquge/errors.json`
  保存抓取失败项目，便于重试

## 单书 JSON 结构

```json
{
  "site": "https://0732.bqg291.cc",
  "bookId": 2530,
  "title": "万相之王",
  "author": "天蚕土豆",
  "category": "玄幻",
  "status": "连载",
  "intro": "天地间有万相，我李洛，终将成为那万相之王。",
  "lastUpdate": "2025-11-15",
  "lastChapter": {
    "chapterId": 1836,
    "title": "第一千八百三十七章 大结局"
  },
  "cover": {
    "originalUrl": "https://www.bqg291.cc/bookimg/2/2530.jpg",
    "localPath": "storage/json/biquge/covers/2530.jpg"
  },
  "chapterCount": 1837,
  "chapters": [
    {
      "chapterNumber": 1,
      "title": "第1章 我有三个相宫",
      "url": "https://0732.bqg291.cc/book/2530/1.html"
    }
  ],
  "fetchedAt": "2026-03-21T18:11:00+08:00"
}
```

## 实现方案

使用 Node.js 脚本直接抓取 JSON 接口，不依赖浏览器，也不引入新三方包。

核心流程：

1. 拉取 `sort=index` 列表
2. 截取前 100 本小说
3. 对每本小说抓取详情与章节目录
4. 生成章节 URL
5. 下载封面图片
6. 写入单书 JSON
7. 生成总索引与错误文件

## 约束与兜底

- 网络请求需要显式超时，避免单个接口卡死
- 单书失败不能影响整批执行，失败项记录到 `errors.json`
- 文件写入前要确保目录存在
- 输出路径统一使用相对工作区路径，避免写入系统目录
- 封面下载失败时仍保留小说 JSON，但记录错误

## 验证方式

- 单元测试覆盖 URL 生成、数据规范化、目录映射
- 先跑 1 本书的实际抓取
- 再跑完整 100 本批次
- 检查 `index.json`、`books` 数量、`covers` 数量与错误日志

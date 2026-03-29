## 之前

### 想的是免费永久存储全部图文内容

通过cloudflare部署开源的telegraph-image项目运行一个
https://aixs.us.ci网站来上传图片，json到 tg 频道存储的方案是实现了免费存储和cdn目标，但是主要限制时 tg账号 有限制，上传速度太慢，增加频道效果不大
所以 claude建议每个上传池按这组信息给，后面他会把脚本改成可并行分片调度：

- poolName
- endpoint
- token 或认证方式
- tg账号标识
- 频道A
- 频道B
- 是否有单池并发上限

到时claude会做这几件事：

- 把 backend/upload-telegraph-batch.js 和 backend/upload-biquge-chapter-cdn.js 改成多上传池调度
- 支持按 bookId 或文件键稳定分片，避免重复上传
- 保留失败重试、任务报告和 map 文件回写
- 给你一套实际运行命令和限速参数建议

## 现在

### 改成轻存储架构我们什么都不存

这个小说站之前的思路错了，我要做全部正文都不存的方案，https://apibi.cc/api/book?id=146 和 https://apibi.cc/api/booklist?id=146 这样的接口反正能返回 章节列表了吧，https://apibi.cc/api/chapter?id=199785&chapterid=809 这样的接口可以读取正文了吧。

那么我们的数据库就可以不用存每本书的章节列表了，这样可以用很小的novels.db就能存储 storage/json/all 下的全部小说了，目前 storage/json/all 下的全部20w+ 小说已经抓取完了 books 和 covers 就差正文没下载了，那个太大了就不下载了，目前可以数据库只保存小说的id 标题，封面地址可以通过相对地址推算出来，数据库节约存储，书的详情页我们挂载本地 storage 目录读取 books 下的json, 正文嘛就直接从apibi.cc取，第一次加载满，后面借助cloudflare的缓存也是不怕的，就这样重构一版，这样数据库就不再只有 storage/json/biquge 那 1400+ 的小说啦，我们可以搜索到20w的小说啦。

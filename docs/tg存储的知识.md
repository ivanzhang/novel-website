上传到 tg 频道存储的方案主要限制时 tg账号 有限制，增加频道效果不大

所以 我建议你每个上传池按这组信息给我，后面我会把脚本改成可并行分片调度：

- poolName
- endpoint
- token 或认证方式
- tg账号标识
- 频道A
- 频道B
- 是否有单池并发上限

到时我会做这几件事：

- 把 backend/upload-telegraph-batch.js 和 backend/upload-biquge-chapter-cdn.js 改成多上传池调度
- 支持按 bookId 或文件键稳定分片，避免重复上传
- 保留失败重试、任务报告和 map 文件回写
- 给你一套实际运行命令和限速参数建议

你把池子整理好发我，我就开始。

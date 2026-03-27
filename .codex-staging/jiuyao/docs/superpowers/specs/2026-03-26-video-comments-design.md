# 视频评论抓取设计

## 目标

为 `/var/zip/jiuyao/_by_id` 下的每个视频生成一个评论 JSON 文件，输出到 `/var/zip/jiuyao/comments/_by_id`。

## 已确认接口

- 登录：`POST /api/app/mine/login/h5`
- 主评论列表：`GET /comment/list`
- 二级回复列表：`GET /comment/info`

主评论参数：

- `objID`: 视频 ID
- `objType`: 对视频固定为 `video`
- `curTime`: ISO 时间字符串
- `pageNumber`
- `pageSize`

二级回复参数：

- `objID`
- `cmtId`
- `fstID`
- `curTime`
- `pageNumber`
- `pageSize`

## 抓取策略

采用混合策略：

- 当源视频元数据 `commentCount > 0` 时，抓取主评论全分页，并递归补抓该主评论的全部二级回复分页
- 当 `commentCount <= 0` 时，不打评论接口，直接生成空评论文件

理由：

- 能覆盖全部视频的输出文件
- 能显著减少无效请求
- 能降低该站点频繁 `4010` 风控导致的中断概率

## 输出结构

每个视频输出一个 `VID{id}.json`，包含：

- `id`
- `title`
- `categoryList`
- `objType`
- `sourceCommentCount`
- `fetchStatus`
- `fetchReason`
- `counts`
- `pagination`
- `comments`

其中 `comments` 以主评论为单位保留原始字段，并新增 `allReplies`，用于汇总预置回复和补抓回复。

## 运行与恢复

- 默认支持断点续跑
- 已存在且 `fetchStatus` 为 `ok` 或 `skipped` 的文件默认跳过
- 失败的视频写入 `_errors.ndjson`，下次可重跑修复
- 汇总写入 `_summary.json`

## 风险

- 源数据中的 `commentCount` 可能与实际接口返回不一致
- 某些主评论若 `commCount > 1` 但缺少 `Info[0].id`，则无法继续补抓二级回复
- 接口存在 `4010` 风控，需要自动重登并在连续失败时轮换 `devID`

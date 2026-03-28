# 全部功能测试指南

## 已实现的6个功能

1. ✅ 书签功能
2. ✅ 章节评论系统
3. ✅ 用户评分功能
4. ✅ 搜索功能
5. ✅ 阅读历史记录页面
6. ✅ 阅读时长统计

---

## 功能测试

### 1. 书签功能

**测试步骤：**
1. 访问 http://localhost:8080
2. 登录账号（testuser / test123）
3. 点击"修仙传奇" → "开始阅读"
4. 在阅读器页面，点击右侧🔖书签按钮
5. 点击"添加书签"，输入备注（可选）
6. 查看书签列表
7. 点击书签可快速跳转
8. 测试删除书签功能

**预期结果：**
- 书签成功添加
- 书签列表显示正确
- 跳转功能正常
- 删除功能正常

---

### 2. 章节评论系统

**测试步骤：**
1. 在阅读器页面，点击💬评论按钮
2. 在文本框输入评论内容
3. 点击"发表评论"
4. 查看评论列表
5. 测试删除自己的评论

**预期结果：**
- 评论成功发表
- 评论列表实时更新
- 显示用户名和时间
- 可以删除自己的评论

---

### 3. 用户评分功能

**测试步骤：**
1. 访问小说详情页（novel.html?id=1）
2. 查看评分区域
3. 点击星星进行评分（1-5星）
4. 页面自动刷新显示新评分
5. 查看平均评分和评分人数

**预期结果：**
- 评分成功提交
- 平均评分更新
- 用户评分高亮显示
- 可以修改评分

---

### 4. 搜索功能

**测试步骤：**
1. 在首页搜索框输入"修仙"
2. 等待500ms自动搜索
3. 查看搜索结果
4. 点击搜索结果跳转
5. 清空搜索框，恢复小说列表

**预期结果：**
- 自动搜索（防抖500ms）
- 显示匹配的小说
- 支持标题和作者搜索
- 清空后恢复列表

**已知问题：**
- 搜索API返回空结果（需要调试）

---

### 5. 阅读历史记录页面

**测试步骤：**
1. 登录后，点击导航栏"阅读历史"
2. 查看阅读过的所有小说
3. 查看阅读进度百分比
4. 查看阅读时长
5. 点击"继续阅读"按钮

**预期结果：**
- 显示所有阅读历史
- 进度条正确显示
- 阅读时长正确显示
- 继续阅读功能正常

---

### 6. 阅读时长统计

**测试步骤：**
1. 开始阅读任意章节
2. 停留30秒以上
3. 查看阅读历史页面
4. 验证阅读时长是否增加

**预期结果：**
- 每30秒自动保存阅读时长
- 历史页面显示累计时长
- 格式：X小时Y分钟

---

## API 测试

### 书签API

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123"}' | jq -r '.token')

# 添加书签
curl -X POST http://localhost:3000/api/bookmarks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"novel_id":1,"chapter_id":1,"chapter_number":1,"note":"测试书签"}'

# 获取书签列表
curl -s http://localhost:3000/api/bookmarks?novel_id=1 \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

### 评论API

```bash
# 发表评论
curl -X POST http://localhost:3000/api/comments \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chapter_id":1,"content":"这章写得真好！"}'

# 获取评论
curl -s http://localhost:3000/api/comments/1 | jq '.'
```

### 评分API

```bash
# 提交评分
curl -X POST http://localhost:3000/api/ratings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"novel_id":1,"rating":5}'

# 获取评分统计
curl -s http://localhost:3000/api/ratings/1 | jq '.'
```

### 搜索API

```bash
# 搜索小说
curl -s "http://localhost:3000/api/search?q=修仙" | jq '.'
```

### 阅读统计API

```bash
# 获取用户阅读统计
curl -s http://localhost:3000/api/reading-stats \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

---

## 数据库验证

```bash
# 查看新增的表
sqlite3 novels.db ".tables"

# 查看书签
sqlite3 novels.db "SELECT * FROM bookmarks;"

# 查看评论
sqlite3 novels.db "SELECT * FROM comments;"

# 查看评分
sqlite3 novels.db "SELECT * FROM ratings;"

# 查看阅读时长
sqlite3 novels.db "SELECT user_id, novel_id, reading_time FROM reading_progress;"
```

---

## 文件清单

### 新增文件
- `frontend/history.html` - 阅读历史页面

### 修改文件
- `backend/db.js` - 新增4个表（bookmarks, comments, ratings, reading_progress扩展）
- `backend/server.js` - 新增约200行API代码
- `frontend/reader.html` - 新增书签、评论面板和阅读时长追踪
- `frontend/novel.html` - 新增评分功能
- `frontend/index.html` - 新增搜索框和历史链接
- `frontend/style.css` - 新增约150行样式

---

## 已知问题

1. **搜索功能**：API返回空结果，需要调试
2. **评论删除**：需要验证用户ID匹配逻辑

---

## 下一步优化

- 修复搜索功能
- 添加评论分页
- 优化阅读时长显示
- 添加书签排序功能
- 实现评分分布图表

---

## 服务器信息

- 后端：http://localhost:3000
- 前端：http://localhost:8080
- 数据库：novels.db

## 测试账号

- 用户名：testuser
- 密码：test123

# 本周功能测试指南

## 已实现的三个功能

### 1. 阅读设置（字体大小、夜间模式）✅
### 2. 章节预加载 ✅
### 3. "前N章免费"功能 ✅

---

## 测试步骤

### 功能1：阅读设置

1. 访问 http://localhost:8080
2. 登录账号（testuser / test123）
3. 点击"修仙传奇"
4. 点击"开始阅读"
5. 在阅读器页面，点击右下角的⚙️设置按钮
6. 测试字体大小：
   - 点击"小"、"中"、"大"、"特大"按钮
   - 观察文字大小变化
7. 测试夜间模式：
   - 勾选"夜间模式"复选框
   - 观察背景变为深色，文字变为浅色
   - 取消勾选，恢复日间模式
8. 刷新页面，验证设置是否保存

**预期结果：**
- 字体大小实时变化
- 夜间模式切换流畅
- 设置持久化保存（刷新后仍保持）

---

### 功能2：章节预加载

1. 在阅读器页面，打开浏览器开发者工具（F12）
2. 切换到 Console 标签
3. 阅读第1章，等待1秒
4. 在控制台看到："预加载第2章成功"
5. 点击"下一章"按钮
6. 观察第2章加载速度（应该很快，因为已预加载）
7. 切换到 Application > Session Storage
8. 查看缓存的章节数据

**预期结果：**
- 控制台显示预加载日志
- 翻页速度明显提升
- sessionStorage 中有缓存数据
- 缓存30分钟后自动过期

---

### 功能3："前N章免费"功能

#### 测试场景1：查看章节列表

1. 访问首页
2. 点击"都市仙尊"（VIP小说，前1章免费）
3. 查看章节列表：
   - 第1章：显示绿色✓图标（免费）
   - 第2章：显示🔒图标（需要会员）

#### 测试场景2：阅读免费章节

1. 点击第1章
2. 应该能正常阅读内容
3. 显示："陈风睁开眼睛，发现自己回到了十年前..."

#### 测试场景3：尝试阅读付费章节

1. 返回章节列表
2. 点击第2章
3. 应该看到权限提示："需要会员才能阅读此章节"
4. 显示"立即开通会员"链接

#### 测试场景4：购买会员后阅读

1. 点击"立即开通会员"
2. 选择套餐（例如1个月）
3. 点击"立即购买"
4. 返回"都市仙尊"
5. 点击第2章
6. 现在应该能正常阅读

**预期结果：**
- 章节列表正确显示免费/付费标识
- 免费章节可以直接阅读
- 付费章节需要会员权限
- 购买会员后可以阅读所有章节

---

## API 测试

### 测试章节权限标识

```bash
# 登录获取token
TOKEN=$(curl -s -X POST http://localhost:3000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123"}' | jq -r '.token')

# 获取章节列表
curl -s http://localhost:3000/api/novels/2/chapters \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | {chapter_number, title, needs_premium}'
```

**预期输出：**
```json
{
  "chapter_number": 1,
  "title": "重生归来",
  "needs_premium": false
}
{
  "chapter_number": 2,
  "title": "重掌力量",
  "needs_premium": true
}
```

### 测试阅读权限

```bash
# 测试第1章（免费）
curl -s http://localhost:3000/api/novels/2/chapters/1 \
  -H "Authorization: Bearer $TOKEN" | jq '{title, content}'

# 测试第2章（需要会员）
curl -s http://localhost:3000/api/novels/2/chapters/2 \
  -H "Authorization: Bearer $TOKEN" | jq '.'
```

---

## 数据库验证

```bash
# 查看小说的免费章节设置
sqlite3 novels.db "SELECT id, title, is_premium, free_chapters FROM novels;"

# 查看章节的VIP标记
sqlite3 novels.db "SELECT id, novel_id, chapter_number, title, is_premium FROM chapters;"
```

**预期结果：**
- 修仙传奇：is_premium=0, free_chapters=0（完全免费）
- 都市仙尊：is_premium=1, free_chapters=1（前1章免费）
- 所有章节：is_premium=0（由小说级控制）

---

## 性能测试

### 测试章节预加载效果

1. 清除 sessionStorage
2. 阅读第1章，记录加载时间
3. 等待预加载完成（1秒）
4. 点击"下一章"，记录加载时间
5. 对比两次加载时间

**预期结果：**
- 第2章加载时间明显短于第1章
- 控制台显示"从缓存加载第2章"

---

## 已知问题和限制

1. **缓存过期时间**：30分钟，可根据需要调整
2. **预加载策略**：只预加载下一章，不预加载上一章
3. **夜间模式**：仅在阅读器页面生效，不影响其他页面
4. **免费章节**：只支持"前N章免费"，不支持"指定章节免费"

---

## 总结

所有三个功能已完整实现并测试通过：

✅ 阅读设置 - 提升用户体验
✅ 章节预加载 - 优化性能
✅ 前N章免费 - 灵活的付费策略

服务器状态：
- 后端：http://localhost:3000 运行中
- 前端：http://localhost:8080 运行中

# 快速演示指南

## 启动服务

### 1. 启动后端（如果还未启动）
```bash
cd /private/var/code/claude/novel-website/backend
cp .env.example .env
npm start
```

后端 API 固定使用 `http://localhost:8081`

### 2. 启动前端（如果还未启动）
```bash
cd /private/var/code/claude/novel-website/frontend
python3 -m http.server 8080
```

前端本地测试固定使用 `http://localhost:8080`，不要用 `3000` 作为页面入口。
`3000` 端口完全让给其它本地项目。

## 演示流程

### 场景1：新用户首次阅读

1. 打开浏览器访问：http://localhost:8080
2. 点击"登录" → "注册新账号"
3. 输入用户名和密码（例如：demo / demo123）
4. 注册成功后自动登录
5. 返回首页，点击"修仙传奇"
6. 查看章节列表，点击"开始阅读"
7. 阅读第一章，点击"下一章"
8. 使用键盘左右箭头翻页

### 场景2：继续阅读

1. 已登录状态下，访问首页
2. 在"继续阅读"区域看到上次阅读的小说
3. 点击卡片，直接跳转到上次阅读位置
4. 继续阅读

### 场景3：VIP内容

1. 点击"都市仙尊"（VIP小说）
2. 尝试阅读，看到权限提示
3. 点击"立即开通会员"
4. 选择套餐购买会员
5. 返回小说页面，现在可以阅读VIP内容

## 测试数据

系统已预置2本小说：

1. **修仙传奇**（免费）
   - 作者：云中客
   - 2章内容
   - 简介：一个少年的修仙之路

2. **都市仙尊**（VIP）
   - 作者：笔墨生
   - 2章内容
   - 简介：仙尊重生都市，再创辉煌

## 快捷键

- `←` 左箭头：上一章
- `→` 右箭头：下一章

## API测试

运行自动化测试：
```bash
cd /private/var/code/claude/novel-website
./test-api.sh
```

## 停止服务

```bash
# 停止后端
pkill -f "node server.js"

# 停止前端
pkill -f "python3 -m http.server 8080"
```

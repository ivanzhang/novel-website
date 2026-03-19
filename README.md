# 中文小说阅读网站

一个支持会员登录和付费购买的中文小说阅读平台，现已支持章节管理和阅读进度追踪。

## 功能特性

- ✅ 用户注册/登录
- ✅ 小说浏览和阅读
- ✅ VIP小说权限控制
- ✅ 会员购买系统
- ✅ JWT身份认证
- ✅ **章节管理系统**（新增）
- ✅ **阅读进度追踪**（新增）
- ✅ **继续阅读功能**（新增）

## 新增功能详解

### 章节管理系统
- 小说内容自动拆分为章节
- 章节列表展示（标题、字数、VIP标识）
- 按章节阅读，按需加载内容
- 支持章节级和小说级会员权限控制

### 阅读进度追踪
- 自动保存用户阅读位置
- "继续阅读"功能，快速回到上次阅读位置
- 首页显示最近阅读的小说
- 滚动位置自动保存（防抖2秒）

### 阅读器功能
- 上一章/下一章导航
- 进度指示器（第X章/共Y章）
- 键盘快捷键支持（左右箭头翻页）
- 浮动导航栏

## 技术栈

- 后端：Node.js + Express + SQLite
- 前端：HTML + CSS + JavaScript
- 认证：JWT
- 数据库：better-sqlite3

## 快速开始

### 1. 安装依赖

```bash
cd backend
npm install
```

### 2. 启动后端服务器

```bash
npm start
```

服务器将运行在 http://localhost:3000

### 3. 打开前端页面

使用浏览器打开 `frontend/index.html` 或使用本地服务器：

```bash
cd frontend
python3 -m http.server 8080
```

然后访问 http://localhost:8080

## 使用说明

1. 注册账号并登录
2. 浏览小说列表
3. 点击小说卡片查看章节列表
4. 点击"开始阅读"或"继续阅读"进入阅读器
5. 使用导航按钮或键盘箭头（←→）翻页
6. 首页"继续阅读"区域显示最近阅读的小说
7. VIP小说/章节需要购买会员后才能阅读

## 数据库结构

- `users` - 用户表
- `novels` - 小说表（新增 chapter_count, description 字段）
- `chapters` - 章节表（新增）
- `reading_progress` - 阅读进度表（新增）
- `orders` - 订单表

## API 端点

### 章节管理
- `GET /api/novels/:novelId/chapters` - 获取章节列表
- `GET /api/novels/:novelId/chapters/:chapterNumber` - 获取章节内容
- `GET /api/chapters/:chapterId` - 通过章节ID获取内容

### 阅读进度
- `GET /api/reading-progress/:novelId` - 获取指定小说的阅读进度
- `POST /api/reading-progress` - 保存/更新阅读进度
- `GET /api/reading-progress` - 获取用户所有阅读进度

## 测试

运行测试脚本验证所有功能：

```bash
chmod +x test-api.sh
./test-api.sh
```

## 文件结构

```
novel-website/
├── backend/
│   ├── db.js           # 数据库架构和迁移
│   ├── server.js       # API端点实现
│   ├── auth.js         # 认证中间件
│   └── package.json    # 依赖配置
├── frontend/
│   ├── index.html      # 首页（含继续阅读）
│   ├── novel.html      # 小说详情页（章节列表）
│   ├── reader.html     # 章节阅读器（新增）
│   ├── login.html      # 登录页
│   ├── membership.html # 会员中心
│   └── style.css       # 样式文件
└── test-api.sh         # API测试脚本
```

## 注意事项

- 这是一个演示项目，支付功能为模拟实现
- 生产环境需要更换 JWT 密钥
- 建议使用 HTTPS 和更安全的密码存储方案
- 实际部署时需要集成真实的支付网关（如支付宝、微信支付）
- 数据迁移会在首次启动时自动执行

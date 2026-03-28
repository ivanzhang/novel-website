#!/bin/bash

# 测试脚本：验证章节管理和阅读进度功能

API_URL="http://localhost:8081/api"

echo "=== 测试章节管理和阅读进度功能 ==="
echo ""

# 1. 注册测试用户
echo "1. 注册测试用户..."
REGISTER_RESPONSE=$(curl -s -X POST $API_URL/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123"}')
echo "注册响应: $REGISTER_RESPONSE"
echo ""

# 2. 登录获取token
echo "2. 登录获取token..."
LOGIN_RESPONSE=$(curl -s -X POST $API_URL/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123"}')
TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "Token: $TOKEN"
echo ""

# 3. 获取小说列表
echo "3. 获取小说列表..."
curl -s $API_URL/novels | jq '.'
echo ""

# 4. 获取小说详情
echo "4. 获取小说详情（小说ID=1）..."
curl -s $API_URL/novels/1 \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# 5. 获取章节列表
echo "5. 获取章节列表（小说ID=1）..."
curl -s $API_URL/novels/1/chapters \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# 6. 获取第一章内容
echo "6. 获取第一章内容..."
curl -s $API_URL/novels/1/chapters/1 \
  -H "Authorization: Bearer $TOKEN" | jq '.title, .content' | head -10
echo ""

# 7. 保存阅读进度
echo "7. 保存阅读进度..."
curl -s -X POST $API_URL/reading-progress \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"novel_id":1,"chapter_id":1,"scroll_position":50}' | jq '.'
echo ""

# 8. 获取阅读进度
echo "8. 获取阅读进度..."
curl -s $API_URL/reading-progress/1 \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

# 9. 获取所有阅读进度（继续阅读）
echo "9. 获取所有阅读进度..."
curl -s $API_URL/reading-progress \
  -H "Authorization: Bearer $TOKEN" | jq '.'
echo ""

echo "=== 测试完成 ==="

#!/bin/bash

# Test script for POST /api/v1/apps and GET /api/v1/apps/[id]
# Make sure you have a valid API key set in the environment variable

set -e

API_KEY="${API_KEY:-sk_live_test}"  # Replace with actual API key
BASE_URL="http://localhost:3000/api/v1"

echo "========================================="
echo "Testing API v1 - Apps Endpoints"
echo "========================================="
echo ""

echo "1. Creating a new app (POST /api/v1/apps)..."
echo "-------------------------------------------"

CREATE_RESPONSE=$(curl -s -X POST "$BASE_URL/apps" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-app",
    "git_provider": "github",
    "repository_id": "123456",
    "repository_name": "test/test-app",
    "repository_url": "https://github.com/test/test-app",
    "branch": "main",
    "framework": "Node.js"
  }')

echo "$CREATE_RESPONSE" | jq '.'
echo ""

# Extract app ID from response (if successful)
APP_ID=$(echo "$CREATE_RESPONSE" | jq -r '.data.id // empty')

if [ -z "$APP_ID" ]; then
  echo "❌ Failed to create app"
  exit 1
fi

echo "✅ App created with ID: $APP_ID"
echo ""

echo "2. Getting app by ID (GET /api/v1/apps/$APP_ID)..."
echo "-------------------------------------------"

GET_RESPONSE=$(curl -s -X GET "$BASE_URL/apps/$APP_ID" \
  -H "Authorization: Bearer $API_KEY")

echo "$GET_RESPONSE" | jq '.'
echo ""

echo "3. Listing all apps (GET /api/v1/apps)..."
echo "-------------------------------------------"

LIST_RESPONSE=$(curl -s -X GET "$BASE_URL/apps" \
  -H "Authorization: Bearer $API_KEY")

echo "$LIST_RESPONSE" | jq '.'
echo ""

echo "========================================="
echo "✅ All tests completed!"
echo "========================================="

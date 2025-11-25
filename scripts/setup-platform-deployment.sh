#!/bin/bash

# Platform Apps Deployment - Quick Setup Script
# This script helps you configure environment variables and apply migrations

set -e

echo "🚀 Platform Apps Deployment - Quick Setup"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo -e "${RED}Error: .env.local not found!${NC}"
    echo "Please create .env.local from .env.example first"
    exit 1
fi

echo "📋 Current Environment Status"
echo "------------------------------"

# Function to check if env var is set
check_env() {
    local var_name=$1
    local value=$(grep "^${var_name}=" .env.local | cut -d '=' -f2)
    
    if [ -z "$value" ] || [[ "$value" == *"<"* ]] || [[ "$value" == *"placeholder"* ]]; then
        echo -e "${RED}❌ $var_name: NOT SET${NC}"
        return 1
    else
        # Mask sensitive values
        local masked="${value:0:10}...${value: -4}"
        echo -e "${GREEN}✅ $var_name: $masked${NC}"
        return 0
    fi
}

# Check all required variables
MISSING=0

check_env "JENKINS_URL" || MISSING=$((MISSING+1))
check_env "CLOUDFLARE_API_TOKEN" || MISSING=$((MISSING+1))
check_env "CLOUDFLARE_ZONE_ID" || MISSING=$((MISSING+1))
check_env "KUBE_IP" || MISSING=$((MISSING+1))
check_env "KUBE_CONFIG_STRING" || MISSING=$((MISSING+1))
check_env "SUPABASE_SERVICE_ROLE_KEY" || MISSING=$((MISSING+1))

echo ""

if [ $MISSING -gt 0 ]; then
    echo -e "${YELLOW}⚠️  $MISSING environment variable(s) need to be configured${NC}"
    echo ""
    echo "📖 How to get these values:"
    echo ""
    echo "1. SUPABASE_SERVICE_ROLE_KEY:"
    echo "   Supabase Dashboard → Your Project → Settings → API → service_role"
    echo ""
    echo "2. KUBE_CONFIG_STRING:"
    echo "   cat ~/.kube/config | base64 -w 0  # Linux"
    echo "   cat ~/.kube/config | base64       # macOS"
    echo ""
    echo "3. JENKINS_URL:"
    echo "   Format: http://username:api_token@jenkins_host:8080"
    echo "   Get token: Jenkins → User → Configure → API Token"
    echo ""
    echo "4. CLOUDFLARE_API_TOKEN:"
    echo "   Cloudflare → My Profile → API Tokens → Create Token"
    echo "   Permissions: Zone.DNS (Edit)"
    echo ""
    echo "5. CLOUDFLARE_ZONE_ID:"
    echo "   Cloudflare → Select domain → Overview (right sidebar)"
    echo ""
    echo "6. KUBE_IP:"
    echo "   External IP of your Kubernetes cluster node"
    echo ""
else
    echo -e "${GREEN}✅ All environment variables are configured!${NC}"
fi

echo ""
echo "🗄️  Database Migration Status"
echo "------------------------------"

# Check if migration file exists
MIGRATION_FILE="supabase/migrations/20251120000002_add_ip_port_to_platform_apps.sql"
if [ -f "$MIGRATION_FILE" ]; then
    echo -e "${GREEN}✅ Migration file found: $MIGRATION_FILE${NC}"
    echo ""
    echo "To apply this migration:"
    echo "1. Open Supabase Dashboard"
    echo "2. Go to SQL Editor"
    echo "3. Run the following SQL:"
    echo ""
    echo -e "${YELLOW}ALTER TABLE platform_apps"
    echo "ADD COLUMN IF NOT EXISTS ip TEXT,"
    echo "ADD COLUMN IF NOT EXISTS port INTEGER;${NC}"
    echo ""
else
    echo -e "${RED}❌ Migration file not found!${NC}"
fi

echo ""
echo "🧪 Testing Checklist"
echo "--------------------"
echo "[ ] All environment variables configured"
echo "[ ] Database migration applied"
echo "[ ] Dev server running (npm run dev)"
echo "[ ] GitHub OAuth connected"
echo "[ ] Test Express repo available"
echo ""

echo "📚 Documentation"
echo "----------------"
echo "• Complete Guide: EXPRESS_DEPLOYMENT_GUIDE.md"
echo "• Implementation Summary: PLATFORM_DEPLOYMENT_SUMMARY.md"
echo "• Test at: http://localhost:3000/dashboard/services/apps/new"
echo ""

if [ $MISSING -eq 0 ]; then
    echo -e "${GREEN}🎉 Setup complete! You can start deploying apps.${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  Please configure missing environment variables before deploying.${NC}"
    exit 1
fi

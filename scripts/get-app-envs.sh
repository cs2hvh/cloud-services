#!/bin/bash
# Get environment variables of a particular app from Kubernetes
# Usage: ./get-app-envs.sh <app-name> [namespace]

APP_NAME=$1
NAMESPACE=${2:-default}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check arguments
if [ -z "$APP_NAME" ]; then
    echo -e "${RED}❌ Usage: $0 <app-name> [namespace]${NC}"
    echo ""
    echo "Examples:"
    echo "  $0 my-app"
    echo "  $0 my-app production"
    exit 1
fi

# Check kubectl exists
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl not found${NC}"
    exit 1
fi

echo -e "${BLUE}🔍 Getting envs for app: ${GREEN}$APP_NAME${NC} in namespace: ${GREEN}$NAMESPACE${NC}"
echo ""

SECRET_NAME="${APP_NAME}-env-secret"
DEPLOYMENT_NAME="${APP_NAME}-app"

# ============================================
# Method 1: Get from K8s Secret
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📦 K8s Secret: ${SECRET_NAME}${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

SECRET_EXISTS=$(kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" -o name 2>/dev/null)

if [ -z "$SECRET_EXISTS" ]; then
    echo -e "${RED}Secret not found${NC}"
else
    # Get all keys and their values from the secret
    SECRET_DATA=$(kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" -o json 2>/dev/null)
    
    if [ -n "$SECRET_DATA" ]; then
        echo -e "${GREEN}Found!${NC} Keys in secret:"
        echo ""
        
        # Extract and decode each key-value pair
        KEYS=$(echo "$SECRET_DATA" | jq -r '.data | keys[]' 2>/dev/null)
        
        if [ -z "$KEYS" ]; then
            echo -e "${YELLOW}(empty - no env vars)${NC}"
        else
            for KEY in $KEYS; do
                VALUE=$(echo "$SECRET_DATA" | jq -r ".data[\"$KEY\"]" | base64 -d 2>/dev/null)
                # Truncate long values
                if [ ${#VALUE} -gt 80 ]; then
                    echo -e "  ${BLUE}$KEY${NC} = ${VALUE:0:80}..."
                else
                    echo -e "  ${BLUE}$KEY${NC} = $VALUE"
                fi
            done
        fi
        
        # Count
        KEY_COUNT=$(echo "$KEYS" | wc -w | tr -d ' ')
        echo ""
        echo -e "${GREEN}Total: $KEY_COUNT env var(s)${NC}"
    fi
fi

echo ""

# ============================================
# Method 2: Get from Running Pod
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}🚀 Running Pod Environment${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Get first running pod for this app
POD_NAME=$(kubectl get pods -n "$NAMESPACE" -l app="$APP_NAME-app" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)

if [ -z "$POD_NAME" ]; then
    # Try without -app suffix
    POD_NAME=$(kubectl get pods -n "$NAMESPACE" -l app="$APP_NAME" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
fi

if [ -z "$POD_NAME" ]; then
    # Try with deployment label
    POD_NAME=$(kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/name=$APP_NAME" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
fi

if [ -z "$POD_NAME" ]; then
    echo -e "${RED}No running pods found for app: $APP_NAME${NC}"
else
    echo -e "Pod: ${GREEN}$POD_NAME${NC}"
    echo ""
    
    # Get env vars from the pod (filter out kubernetes built-ins and service discovery)
    echo "Environment variables (filtered):"
    echo ""
    
    kubectl exec -n "$NAMESPACE" "$POD_NAME" -- env 2>/dev/null | \
        grep -v "^KUBERNETES" | \
        grep -v "_SERVICE_" | \
        grep -v "_PORT_" | \
        grep -v "_PORT=" | \
        grep -v "^PATH=" | \
        grep -v "^HOME=" | \
        grep -v "^HOSTNAME=" | \
        grep -v "^TERM=" | \
        grep -v "^SHLVL=" | \
        grep -v "^PWD=" | \
        grep -v "^YARN_VERSION=" | \
        grep -v "^NODE_VERSION=" | \
        grep -v "^NPM_VERSION=" | \
        sort | \
    while IFS='=' read -r KEY VALUE; do
        # Truncate long values
        if [ ${#VALUE} -gt 80 ]; then
            echo -e "  ${BLUE}$KEY${NC} = ${VALUE:0:80}..."
        else
            echo -e "  ${BLUE}$KEY${NC} = $VALUE"
        fi
    done
fi

echo ""

# ============================================
# Method 3: Get from Deployment Spec
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}📋 Deployment Spec: ${DEPLOYMENT_NAME}${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

DEPLOYMENT_EXISTS=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o name 2>/dev/null)

if [ -z "$DEPLOYMENT_EXISTS" ]; then
    echo -e "${RED}Deployment not found${NC}"
else
    # Check if using envFrom with secret
    ENV_FROM=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].envFrom}' 2>/dev/null)
    
    if [ -n "$ENV_FROM" ] && [ "$ENV_FROM" != "null" ]; then
        echo -e "Using envFrom: ${GREEN}$ENV_FROM${NC}"
    fi
    
    # Get restart annotation (indicates when last restart was triggered)
    RESTART_AT=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.template.metadata.annotations.kubectl\.kubernetes\.io/restartedAt}' 2>/dev/null)
    
    if [ -n "$RESTART_AT" ]; then
        echo -e "Last restart: ${GREEN}$RESTART_AT${NC}"
    fi
    
    # Get pod status
    READY=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
    DESIRED=$(kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o jsonpath='{.status.replicas}' 2>/dev/null)
    
    echo -e "Replicas: ${GREEN}$READY/$DESIRED ready${NC}"
fi

echo ""
echo -e "${GREEN}✅ Done${NC}"

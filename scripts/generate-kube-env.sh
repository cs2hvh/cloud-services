#!/bin/bash
# Generate KUBE_IP and KUBE_CONFIG_STRING using kubectl
# KUBE_IP should be the IP of a node running NGINX Ingress with hostNetwork

# Check kubectl exists
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found"
    exit 1
fi

echo "Using kubectl config:"
kubectl config current-context

# Get the node where NGINX Ingress controller is running
NGINX_NODE=$(kubectl get pods -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null)

if [ -z "$NGINX_NODE" ]; then
    echo "⚠️  NGINX Ingress controller not found, falling back to first worker node"
    # Get first worker node (non-control-plane)
    NGINX_NODE=$(kubectl get nodes --selector='!node-role.kubernetes.io/control-plane' -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
fi

echo "NGINX Ingress runs on node: $NGINX_NODE"

# Get the Internal IP of that node (this is the publicly routable IP on Linode/DO)
KUBE_IP=$(kubectl get node "$NGINX_NODE" -o jsonpath='{.status.addresses[?(@.type=="InternalIP")].address}' 2>/dev/null)

# If no InternalIP, try ExternalIP
if [ -z "$KUBE_IP" ]; then
    KUBE_IP=$(kubectl get node "$NGINX_NODE" -o jsonpath='{.status.addresses[?(@.type=="ExternalIP")].address}' 2>/dev/null)
fi

echo "Node IP: $KUBE_IP"

# Verify NGINX has hostNetwork enabled (required for port 80/443 access)
HOST_NETWORK=$(kubectl get pods -n ingress-nginx -l app.kubernetes.io/component=controller -o jsonpath='{.items[0].spec.hostNetwork}' 2>/dev/null)
if [ "$HOST_NETWORK" != "true" ]; then
    echo ""
    echo "⚠️  WARNING: NGINX Ingress does NOT have hostNetwork enabled!"
    echo "   Traffic on port 80/443 will NOT reach NGINX."
    echo "   You need to either:"
    echo "   1. Enable hostNetwork on NGINX Ingress, OR"
    echo "   2. Use NodePort (30682 for HTTP, 31751 for HTTPS)"
    echo ""
fi

# Get base64 kubeconfig from kubectl
KUBE_CONFIG_STRING=$(kubectl config view --minify --flatten -o yaml | base64 | tr -d '\n')

echo ""
echo "=== Add to .env.local ==="
echo ""
echo "KUBE_IP=$KUBE_IP"
echo "KUBE_CONFIG_STRING=$KUBE_CONFIG_STRING"
echo ""

# Save to file (using echo to ensure single line)
echo "KUBE_IP=$KUBE_IP" > .env.kube.generated
echo "KUBE_CONFIG_STRING=$KUBE_CONFIG_STRING" >> .env.kube.generated

echo "✅ Saved to .env.kube.generated"

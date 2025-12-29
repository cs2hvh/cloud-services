#!/bin/bash

# Usage:
#   ./switch-kubeconfig.sh /path/to/cluster.yaml

KUBEFILE="$1"

if [ -z "$KUBEFILE" ]; then
  echo "❌ Error: No file provided."
  echo "Usage: ./switch-kubeconfig.sh <path-to-kubeconfig.yaml>"
  exit 1
fi

if [ ! -f "$KUBEFILE" ]; then
  echo "❌ Error: File not found at: $KUBEFILE"
  exit 1
fi

echo "📁 Copying kubeconfig to ~/.kube/config ..."
mkdir -p ~/.kube
cp "$KUBEFILE" ~/.kube/config

echo "🔧 Setting correct permissions ..."
chmod 600 ~/.kube/config

echo "🔄 Verifying cluster connection..."
kubectl cluster-info
kubectl get nodes

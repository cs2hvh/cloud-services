# Express App Deployment Guide

## Overview
This implementation supports deploying Express.js applications with automatic Dockerfile generation if none exists. The deployment uses the same Jenkins + Kubernetes infrastructure as the app-platform project.

## How It Works

### 1. Simplified Express Pipeline
When you select `express` as the framework, the system uses `createExpressPipelineXml()` which:
- **Auto-generates Dockerfile** if your repo doesn't have one
- Uses Node 18 Alpine base image
- Runs `npm ci --only=production` for faster builds
- Exposes the allocated NodePort
- Injects `PORT` environment variable to your app
- Deploys with 1 replica (vs 2 for other frameworks)

### 2. Default Dockerfile Template
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE [YOUR_PORT]
CMD ["npm", "start"]
```

### 3. Express App Requirements
Your Express app should:
```javascript
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

## Deployment Flow

### Via UI (http://localhost:3000/dashboard/services/apps/new)
1. **Select Provider**: Choose GitHub/GitLab/Bitbucket
2. **Select Repository**: Pick your Express app repo
3. **Configure**:
   - Name: `my-express-app`
   - Framework: Select `express`
   - Branch: `main`
   - Environment Variables (optional): `NODE_ENV=production`, etc.
4. **Deploy**: Click deploy button

The system will:
- Allocate a NodePort (31000-32000)
- Create DNS record: `my-express-app.uizb210.xyz`
- Create Jenkins job with Express pipeline
- Build Docker image (auto-generate Dockerfile if needed)
- Push to `hav0ky/my-express-app-app:latest`
- Deploy to Kubernetes with SSL certificate
- Status updates automatically in database

### Via API
```bash
curl -X POST http://localhost:3000/api/services/platform-apps/create \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "name": "my-express-app",
    "repository_url": "https://github.com/username/express-app",
    "branch": "main",
    "framework": "express",
    "env_vars": [
      {"key": "NODE_ENV", "value": "production"}
    ]
  }'
```

## Environment Variables

### Required in `.env.local`
```bash
# Jenkins
JENKINS_URL=http://username:token@your-jenkins:8080

# Cloudflare DNS
CLOUDFLARE_API_TOKEN=your_cloudflare_token
CLOUDFLARE_ZONE_ID=your_zone_id

# Kubernetes
KUBE_IP=your.k8s.node.ip
KUBE_CONFIG_STRING=<base64-encoded-kubeconfig>

# Supabase
SUPABASE_SERVICE_ROLE_KEY=<get-from-supabase-dashboard>
```

### How to Get Values

#### SUPABASE_SERVICE_ROLE_KEY
1. Go to Supabase Dashboard
2. Project Settings → API
3. Copy "service_role" key (secret)

#### KUBE_CONFIG_STRING
```bash
# On your machine with kubectl access:
cat ~/.kube/config | base64 -w 0  # Linux
cat ~/.kube/config | base64      # macOS
```

## Port Allocation

- Automatically allocates from range: **31000-32000**
- Queries existing apps to find next available port
- Falls back to random selection if sequential fails

## DNS & SSL

- DNS: `{app-name}.uizb210.xyz` → A record pointing to `KUBE_IP`
- SSL: Automatic via cert-manager with `letsencrypt-prod` ClusterIssuer
- TTL: 0 (immediate propagation)

## Kubernetes Resources Created

For app named `my-express-app` on port `31500`:

### 1. Certificate
```yaml
metadata:
  name: letsencrypt-nginx
spec:
  dnsNames:
    - my-express-app.uizb210.xyz
```

### 2. Deployment
```yaml
metadata:
  name: my-express-app-app
spec:
  replicas: 1
  containers:
  - name: my-express-app-app
    image: hav0ky/my-express-app-app:latest
    ports:
      - containerPort: 31500
    env:
      - name: PORT
        value: "31500"
```

### 3. Service (NodePort)
```yaml
metadata:
  name: my-express-app-service
spec:
  type: NodePort
  ports:
    - port: 31500
      targetPort: 31500
      nodePort: 31500
```

### 4. Ingress
```yaml
metadata:
  name: my-express-app-ingress
spec:
  tls:
    - hosts:
        - my-express-app.uizb210.xyz
      secretName: letsencrypt-nginx
  rules:
    - host: my-express-app.uizb210.xyz
      http:
        paths:
        - path: /
          backend:
            service:
              name: my-express-app-service
              port: 31500
```

## Troubleshooting

### Check Deployment Status
```bash
# Via Kubernetes
kubectl get deployments,services,ingress -l app=my-express-app-app

# Via Jenkins
# Visit: http://your-jenkins:8080/job/my-express-app-job/

# Via Database
# Query platform_apps table for status field
```

### Common Issues

1. **Build Failing**
   - Check `package.json` has `start` script
   - Verify `package-lock.json` exists (for npm ci)
   - Check Jenkins job console output

2. **Port Not Accessible**
   - Verify app listens on `process.env.PORT`
   - Check Kubernetes service: `kubectl get svc my-express-app-service`

3. **DNS Not Resolving**
   - Verify Cloudflare token has DNS edit permissions
   - Check A record created: `dig my-express-app.uizb210.xyz`

4. **SSL Certificate Pending**
   - cert-manager needs 1-2 minutes to issue
   - Check: `kubectl get certificate letsencrypt-nginx`

## Testing Locally

1. **Fill environment variables** in `.env.local`
2. **Apply database migration**:
   ```sql
   -- In Supabase SQL Editor
   ALTER TABLE platform_apps
   ADD COLUMN IF NOT EXISTS ip TEXT,
   ADD COLUMN IF NOT EXISTS port INTEGER;
   ```

3. **Start dev server**: `npm run dev`
4. **Navigate to**: http://localhost:3000/dashboard/services/apps/new
5. **Deploy test Express app**

## Example Express App

Minimal Express app compatible with this deployment:

```javascript
// app.js
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

```json
// package.json
{
  "name": "simple-express",
  "version": "1.0.0",
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

## Next Steps

1. Fill in actual values for:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `KUBE_CONFIG_STRING`
2. Apply the database migration
3. Test with a simple Express repository
4. Monitor Jenkins job execution
5. Access deployed app at `https://{app-name}.uizb210.xyz`

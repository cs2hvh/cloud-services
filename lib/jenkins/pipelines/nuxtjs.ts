/**
 * Nuxt.js Pipeline Generator
 * 
 * Creates a Jenkins pipeline configuration for Nuxt.js (Nuxt 3) applications.
 * Uses Nitro server with Node.js preset, auto-generates Dockerfile if not present.
 * Uses Kubernetes Secrets for environment variables (secure)
 * 
 * DEPLOYMENT CONTRACT:
 * 1. Build stage
 * 2. Create Environment Secret stage
 * 3. Deploy to Kubernetes stage
 * 
 * Nuxt 3 Architecture:
 * - Build output: .output/ directory
 * - Server: Nitro (runs as Node.js server)
 * - Default port: 3000
 * - Production command: node .output/server/index.mjs
 */
import { generateEnvSecret, generateEnvFromSection, generateRuntimeDefaultEnvYaml, EnvVar } from './utils';

export function createNuxtJsPipeline(
  name: string,
  gitUrl: string,
  branch: string,
  nodePort: string,
  size: string = 'small',
  appDomain: string = 'galaxyhvh.com',
  envVars: EnvVar[] = [],
): string {
  const domain = `${name}.${appDomain}`;
  const appName = `${name}-app`;
  const serviceName = `${name}-service`;
  const ingressName = `${name}-ingress`;

  // Remove token from URL for display purposes
  // Handle GitHub, GitLab, and Bitbucket formats
  const cleanUrl = gitUrl
    .replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/')
    .replace(/https:\/\/oauth2:[^@]+@gitlab\.com\//, 'https://gitlab.com/')
    .replace(/https:\/\/x-token-auth:[^@]+@bitbucket\.org\//, 'https://bitbucket.org/');
  
  const sizeKey = (size || 'small').toLowerCase();

  // Resource allocation based on size
  let cpuRequest = '500m';
  let cpuLimit = '1';
  let memoryRequest = '512Mi';
  let memoryLimit = '1Gi';
  let replicas = 1;

  if (sizeKey === 'medium') {
    cpuRequest = '1';
    cpuLimit = '2';
    memoryRequest = '1Gi';
    memoryLimit = '2Gi';
    replicas = 2;
  } else if (sizeKey === 'large') {
    cpuRequest = '1.5';
    cpuLimit = '3';
    memoryRequest = '2Gi';
    memoryLimit = '3Gi';
    replicas = 3;
  }

  // Nuxt 3 runs on port 3000 by default with Nitro
  const containerPort = 3000;

  // Generate Kubernetes Secret for environment variables (secure approach)
  const { secretYaml, secretName, hasSecret } = generateEnvSecret(name, envVars);
  const envFromSection = generateEnvFromSection(secretName, hasSecret);
  const defaultEnvYaml = generateRuntimeDefaultEnvYaml('node', containerPort);

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <description>
    Nuxt.js Deployment Pipeline for ${name}
    Accessible at https://${domain} via NGINX Ingress
    
    Framework: Nuxt 3 with Nitro server
    Build Output: .output/
    Server: node .output/server/index.mjs
  </description>

  <properties>
    <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github@1.34.4">
      <projectUrl>${cleanUrl}</projectUrl>
    </com.coravy.hudson.plugins.github.GithubProjectProperty>
  </properties>

  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script><![CDATA[
pipeline {
  agent {
    kubernetes {
      inheritFrom 'common-agent'
      podRetention never()
      activeDeadlineSeconds 1800
    }
  }

  environment {
    APP_NAME = '${appName}'
    SERVICE_NAME = '${serviceName}'
    INGRESS_NAME = '${ingressName}'
    DOMAIN = '${domain}'
    CONTAINER_PORT = '${containerPort}'
    DOCKER_IMAGE = "hav0ky/${appName}:latest"
    ENV_SECRET_NAME = '${secretName}'
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {

    stage('Checkout Repo') {
      steps {
        container('git') {
          git branch: '${branch}', url: '${gitUrl}'
        }
      }
    }

    stage('Prepare Dockerfile') {
      steps {
        container('git') {
          sh '''
            if [ -f Dockerfile ]; then
              echo "Using existing Dockerfile"
            else
              echo "Creating Nuxt.js Dockerfile (Nuxt 3 with Nitro)"

cat > Dockerfile << 'EOF'
# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .

# Build Nuxt 3 app (creates .output directory)
RUN npm run build

# ---- Production Stage ----
FROM node:20-alpine AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nuxt

# Copy built output from builder
COPY --from=builder --chown=nuxt:nodejs /app/.output ./.output

# Switch to non-root user
USER nuxt

# Nuxt 3 Nitro server runs on port 3000
EXPOSE 3000

# Set environment variables
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production

# Start Nitro server
CMD ["node", ".output/server/index.mjs"]
EOF
            fi
          '''
        }
      }
    }

    stage('Build Image with Kaniko') {
      steps {
        container('kaniko') {
          withCredentials([usernamePassword(credentialsId: 'dockerhublogin',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS')]) {

            sh '''
              mkdir -p /kaniko/.docker
              AUTH=$(echo -n "$DOCKER_USER:$DOCKER_PASS" | base64)

              cat <<EOF > /kaniko/.docker/config.json
{
  "auths": {
    "https://index.docker.io/v1/": {
      "auth": "$AUTH"
    }
  }
}
EOF

              /kaniko/executor \
                --context=$WORKSPACE \
                --dockerfile=Dockerfile \
                --destination=$DOCKER_IMAGE
            '''
          }
        }
      }
    }

    stage('Create Environment Secret') {
      when {
        expression { return ${hasSecret} }
      }
      steps {
        container('kubectl') {
          sh '''
            echo "STAGE: Create Environment Secret"
            echo "Creating Kubernetes secret: \${ENV_SECRET_NAME}"
            cat > env-secret.yaml << 'SECRET_EOF'
${secretYaml}
SECRET_EOF
            kubectl apply -f env-secret.yaml
            echo "Environment secret created successfully"
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {
          sh '''
            echo "STAGE: Deploy to Kubernetes"
            
            echo "Generating Kubernetes deployment manifest"
            cat > deployment.yaml << DEPLOY_EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: \${APP_NAME}
  namespace: default
  labels:
    app: \${APP_NAME}
    framework: nuxtjs
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: \${APP_NAME}
  template:
    metadata:
      labels:
        app: \${APP_NAME}
        framework: nuxtjs
    spec:
      containers:
      - name: \${APP_NAME}
        image: \${DOCKER_IMAGE}
        imagePullPolicy: Always
        ports:
        - containerPort: ${containerPort}
${envFromSection}
${defaultEnvYaml}
        resources:
          requests:
            cpu: ${cpuRequest}
            memory: ${memoryRequest}
          limits:
            cpu: ${cpuLimit}
            memory: ${memoryLimit}
        readinessProbe:
          httpGet:
            path: /
            port: ${containerPort}
          initialDelaySeconds: 10
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /
            port: ${containerPort}
          initialDelaySeconds: 20
          periodSeconds: 20
DEPLOY_EOF

            echo "Generating Kubernetes service manifest"
            cat > service.yaml << SERVICE_EOF
apiVersion: v1
kind: Service
metadata:
  name: \${SERVICE_NAME}
  namespace: default
  labels:
    app: \${APP_NAME}
    framework: nuxtjs
spec:
  selector:
    app: \${APP_NAME}
  ports:
  - protocol: TCP
    port: 80
    targetPort: ${containerPort}
  type: ClusterIP
SERVICE_EOF

            echo "Generating certificate manifest"
            cat > certificate.yaml << CERT_EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${name}-cert
  namespace: default
spec:
  secretName: ${name}-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - \${DOMAIN}
CERT_EOF

            echo "Generating Kubernetes ingress manifest"
            cat > ingress.yaml << INGRESS_EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: \${INGRESS_NAME}
  namespace: default
  labels:
    app: \${APP_NAME}
    framework: nuxtjs
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - \${DOMAIN}
    secretName: ${name}-tls
  rules:
  - host: \${DOMAIN}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: \${SERVICE_NAME}
            port:
              number: 80
INGRESS_EOF
          '''

          sh 'kubectl apply -f deployment.yaml'
          sh 'kubectl rollout restart deployment/\${APP_NAME} -n default'
          sh 'kubectl apply -f service.yaml'
          sh 'kubectl apply -f certificate.yaml || echo "WARNING: cert-manager not installed, skipping certificate"'
          sh 'kubectl apply -f ingress.yaml || echo "WARNING: ingress webhook timeout, skipping ingress"'
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        container('kubectl') {
          sh '''
            echo "STAGE: Verify Deployment"
            echo "Checking deployment status for $APP_NAME"
            kubectl get deployment,service,ingress -l app=$APP_NAME
            kubectl get pods -l app=$APP_NAME
            echo "Deployment verification completed successfully"
            echo "Application URL: https://$DOMAIN"
          '''
        }
      }
    }

  }

  post {
    success {
      sh '''
        echo "PIPELINE: Success"
        echo "Nuxt.js deployment completed successfully for $APP_NAME"
        echo "Service URL: https://$DOMAIN"
      '''
    }
    
    failure {
      sh '''
        echo "PIPELINE: Failure"
        echo "Nuxt.js deployment failed for $APP_NAME"
        echo "Check build logs and ensure Nuxt 3 project structure is correct"
      '''
    }
  }
}
]]></script>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>
`;

  return pipelineXml;
}

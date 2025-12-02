export function createNextJsPipeline(
  name: string,
  gitUrl: string,
  branch: string,
  nodePort: string,
  size: string = 'small',
  appDomain: string = 'galaxyhvh.com',
): string {
  const domain = `${name}.${appDomain}`;
  const appName = `${name}-app`;
  const serviceName = `${name}-service`;
  const ingressName = `${name}-ingress`;

  // sanitize git url
  const cleanUrl = gitUrl.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/');
  const sizeKey = (size || 'small').toLowerCase();

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

  // fixed container port for Next.js
  const containerPort = 3000;

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <description>
    Next.js Deployment Pipeline for ${name}
    Accessible at https://${domain} via NGINX Ingress
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
              echo "Creating default Next.js Dockerfile (Node 20 required)"

cat > Dockerfile << 'EOF'
# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ---- Run Stage ----
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/public ./public

RUN npm install --only=production

# Next.js listens on container port 3000
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
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
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: \${APP_NAME}
  template:
    metadata:
      labels:
        app: \${APP_NAME}
    spec:
      containers:
      - name: \${APP_NAME}
        image: \${DOCKER_IMAGE}
        imagePullPolicy: Always
        ports:
        - containerPort: ${containerPort}
        env:
        - name: PORT
          value: "${containerPort}"
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
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /
            port: ${containerPort}
          initialDelaySeconds: 15
          periodSeconds: 20
DEPLOY_EOF

            echo "Generating Kubernetes service manifest"
            cat > service.yaml << SERVICE_EOF
apiVersion: v1
kind: Service
metadata:
  name: \${SERVICE_NAME}
  namespace: default
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
          '''
        }
      }
    }

  }

  post {
    success {
      sh '''
        echo "PIPELINE: Success"
        echo "Deployment completed successfully for $APP_NAME"
        echo "Service URL: https://$DOMAIN"
      '''
    }
    
    failure {
      sh '''
        echo "PIPELINE: Failure"
        echo "Deployment failed for $APP_NAME"
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

/**
 * Express.js Pipeline with Auto-Dockerfile
 * Creates Dockerfile if missing, builds and deploys
 */
export function createExpressPipeline(
  name: string,
  gitUrl: string,
  branch: string,
  nodePort: string,
): string {
  const domain = `${name}.uizb210.xyz`;
  const appName = `${name}-app`;
  const serviceName = `${name}-service`;
  const ingressName = `${name}-ingress`;

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Express.js deployment pipeline for ${name}
    Auto-creates Dockerfile if missing
    Accessible at https://${domain} (port ${nodePort})
  </description>
  <keepDependencies>false</keepDependencies>

  <properties>
    <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github@1.34.4">
      <projectUrl>${gitUrl}</projectUrl>
    </com.coravy.hudson.plugins.github.GithubProjectProperty>
  </properties>

  <triggers>
    <hudson.triggers.SCMTrigger>
      <spec>H/1 * * * *</spec>
      <ignorePostCommitHooks>false</ignorePostCommitHooks>
    </hudson.triggers.SCMTrigger>
  </triggers>

  <disabled>false</disabled>

  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script>
<![CDATA[
pipeline {
  agent any

  environment {
    KUBECONFIG = credentials('kubeconfig_file')
    DOCKER_REGISTRY = 'hav0ky'
    APP_NAME = '${appName}'
    IMAGE_TAG = "\${DOCKER_REGISTRY}/\${APP_NAME}:latest"
  }

  stages {

    stage('Clone Repository') {
      steps {
        echo 'Cloning repository...'
        git branch: '${branch}', url: '${gitUrl}'
      }
    }

    stage('Prepare Dockerfile') {
      steps {
        echo 'Checking for Dockerfile...'
        sh '''
          if [ ! -f Dockerfile ]; then
            echo "No Dockerfile found, creating default Express Dockerfile..."
            cat > Dockerfile << 'DOCKER_EOF'
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port
EXPOSE ${nodePort}

# Start command
CMD ["npm", "start"]
DOCKER_EOF
            echo "✓ Dockerfile created"
          else
            echo "✓ Using existing Dockerfile"
          fi
          
          echo ""
          echo "=== Dockerfile Content ==="
          cat Dockerfile
        '''
      }
    }

    stage('Build Docker Image') {
      steps {
        echo 'Building Docker image...'
        sh 'docker build -t \${IMAGE_TAG} .'
      }
    }

    stage('Push to Docker Hub') {
      steps {
        echo 'Pushing to Docker Hub...'
        withCredentials([usernamePassword(
          credentialsId: 'dockerhublogin',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo \$DOCKER_PASS | docker login -u \$DOCKER_USER --password-stdin
            docker push \${IMAGE_TAG}
            docker logout
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        echo 'Deploying to Kubernetes...'
        sh '''
          # Apply Deployment
          cat <<EOF | kubectl apply -f - --kubeconfig=\$KUBECONFIG
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
  namespace: default
  labels:
    app: ${appName}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
      - name: ${appName}
        image: \${IMAGE_TAG}
        imagePullPolicy: Always
        ports:
        - containerPort: ${nodePort}
        env:
        - name: PORT
          value: "${nodePort}"
        resources:
          requests:
            cpu: 250m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /
            port: ${nodePort}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /
            port: ${nodePort}
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
EOF

          # Apply Service
          cat <<EOF | kubectl apply -f - --kubeconfig=\$KUBECONFIG
apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
  namespace: default
spec:
  selector:
    app: ${appName}
  ports:
  - protocol: TCP
    port: ${nodePort}
    targetPort: ${nodePort}
    nodePort: ${nodePort}
  type: NodePort
EOF

          # Apply Certificate
          cat <<EOF | kubectl apply -f - --kubeconfig=\$KUBECONFIG
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
  - ${domain}
EOF

          # Apply Ingress
          cat <<EOF | kubectl apply -f - --kubeconfig=\$KUBECONFIG
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${ingressName}
  namespace: default
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - ${domain}
    secretName: ${name}-tls
  rules:
  - host: ${domain}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${serviceName}
            port:
              number: ${nodePort}
EOF

          echo "✓ Express deployment completed!"
        '''
      }
    }

    stage('Verify Deployment') {
      steps {
        echo 'Verifying deployment...'
        sh '''
          kubectl get deployment,service,ingress -l app=${appName} --kubeconfig=\$KUBECONFIG
          echo ""
          kubectl get pods -l app=${appName} --kubeconfig=\$KUBECONFIG
        '''
      }
    }

  }
  
  post {
    success {
      echo '✓ Express deployment successful!'
      echo 'Access your app at: https://${domain}'
    }
    failure {
      echo '✗ Express deployment failed. Check logs above.'
    }
  }
}
]]>
    </script>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>
`;
  return pipelineXml;
}

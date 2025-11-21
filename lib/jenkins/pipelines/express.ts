/**
 * Express.js Pipeline - Express, Node.js Backend
 * Auto-creates Dockerfile, builds with Kaniko
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
  
  // Remove token from URL for display purposes (keep only clean URL for metadata)
  const cleanUrl = gitUrl.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/');

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Express.js deployment pipeline for ${name}
    Auto-creates Dockerfile if missing, builds with Kaniko
    Accessible at https://${domain} (port ${nodePort})
  </description>
  <keepDependencies>false</keepDependencies>

  <properties>
    <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github@1.34.4">
      <projectUrl>${cleanUrl}</projectUrl>
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
  agent {
    kubernetes {
      yaml """
apiVersion: v1
kind: Pod
metadata:
  labels:
    jenkins: agent
spec:
  containers:
  - name: git
    image: alpine/git:latest
    command:
    - cat
    tty: true
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command:
    - /busybox/cat
    tty: true
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
      readOnly: false
  - name: kubectl
    image: bitnami/kubectl:latest
    command:
    - cat
    tty: true
  volumes:
  - name: docker-config
    emptyDir: {}
"""
    }
  }

  environment {
    APP_NAME = '${appName}'
    SERVICE_NAME = '${serviceName}'
    INGRESS_NAME = '${ingressName}'
    DOMAIN = '${domain}'
    NODE_PORT = '${nodePort}'
    DOCKER_IMAGE = "hav0ky/${appName}:latest"
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {

    stage('Initialize') {
      steps {
        script {
          echo 'STAGE: Initialize'
          echo "Application Name: \${env.APP_NAME}"
          echo "Git Repository: ${gitUrl}"
          echo "Branch: ${branch}"
          echo "Port: \${env.NODE_PORT}"
          echo "Domain: \${env.DOMAIN}"
          echo "Build Number: \${env.BUILD_NUMBER}"
          echo 'Initialization completed'
        }
      }
    }

    stage('Checkout Repository') {
      steps {
        container('git') {
          script {
            echo 'STAGE: Checkout Repository'
            echo 'Fetching source code from repository'
            git branch: '${branch}', url: '${gitUrl}'
            sh '''
              git config --global --add safe.directory "$(pwd)"
              git log -1 --oneline
            '''
            echo 'Source code checkout completed'
          }
        }
      }
    }

    stage('Validate Prerequisites') {
      steps {
        container('git') {
          script {
            echo 'STAGE: Validate Prerequisites'
            echo 'Checking required files and project structure'
            sh '''
              if [ ! -f package.json ]; then
                echo 'WARNING: package.json not found'
                echo 'Express projects typically require a package.json file'
              else
                echo 'package.json found'
              fi
              
              echo 'Prerequisites check completed'
            '''
          }
        }
      }
    }

    stage('Prepare Dockerfile') {
      steps {
        container('git') {
          script {
            echo 'STAGE: Prepare Dockerfile'
            sh '''
              if [ -f Dockerfile ]; then
                echo 'Using existing Dockerfile'
              else
                echo 'Generating default Express Dockerfile'
                cat > Dockerfile << 'DOCKERFILE_END'
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

EXPOSE ${nodePort}

CMD ["npm", "start"]
DOCKERFILE_END
                echo 'Dockerfile generated successfully'
              fi
              
              if ! grep -q "FROM" Dockerfile; then
                echo 'ERROR: Invalid Dockerfile - missing FROM instruction'
                exit 1
              fi
              
              echo 'Dockerfile Contents:'
              cat Dockerfile
              echo 'Dockerfile preparation completed'
            '''
          }
        }
      }
    }

    stage('Build Docker Image') {
      steps {
        container('kaniko') {
          script {
            echo 'STAGE: Build Docker Image'
            echo "Building image: \${env.DOCKER_IMAGE}"
            withCredentials([usernamePassword(
              credentialsId: 'dockerhublogin',
              usernameVariable: 'DOCKER_USER',
              passwordVariable: 'DOCKER_PASS'
            )]) {
              sh '''
                mkdir -p /kaniko/.docker
                AUTH=\$(echo -n "\$DOCKER_USER:\$DOCKER_PASS" | base64)

                cat <<EOF > /kaniko/.docker/config.json
{
  "auths": {
    "https://index.docker.io/v1/": {
      "auth": "\$AUTH"
    }
  }
}
EOF

                echo 'Executing Kaniko build'
                /kaniko/executor \\
                  --context=\$PWD \\
                  --dockerfile=Dockerfile \\
                  --destination=\${DOCKER_IMAGE}
                
                echo 'Image build completed successfully'
              '''
            }
          }
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {
          script {
            echo 'STAGE: Deploy to Kubernetes'
            echo 'Applying Kubernetes manifests'
            sh '''
              echo 'Configuring kubectl with provided kubeconfig'
              export KUBECONFIG=\${KUBECONFIG}
              
              echo 'Creating namespace if not exists'
              kubectl create namespace default --dry-run=client -o yaml | kubectl apply -f -
              
              echo 'Generating Kubernetes deployment manifest'
              cat > deployment.yaml << 'DEPLOY_EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: \${APP_NAME}
  namespace: default
  labels:
    app: \${APP_NAME}
spec:
  replicas: 1
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
        - containerPort: \${NODE_PORT}
        env:
        - name: PORT
          value: "\${NODE_PORT}"
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
            port: \${NODE_PORT}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /
            port: \${NODE_PORT}
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
DEPLOY_EOF

              echo 'Generating Kubernetes service manifest'
              cat > service.yaml << 'SERVICE_EOF'
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
    port: \${NODE_PORT}
    targetPort: \${NODE_PORT}
    nodePort: \${NODE_PORT}
  type: NodePort
SERVICE_EOF

              echo 'Generating certificate manifest'
              cat > certificate.yaml << 'CERT_EOF'
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

              echo 'Generating Kubernetes ingress manifest'
              cat > ingress.yaml << 'INGRESS_EOF'
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
              number: \${NODE_PORT}
INGRESS_EOF

              echo 'Applying deployment manifest'
              kubectl apply -f deployment.yaml
              
              echo 'Applying service manifest'
              kubectl apply -f service.yaml
              
              echo 'Applying certificate manifest'
              kubectl apply -f certificate.yaml
              
              echo 'Applying ingress manifest'
              kubectl apply -f ingress.yaml
              
              echo 'Kubernetes deployment completed'
            '''
          }
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        container('kubectl') {
          script {
            echo 'STAGE: Verify Deployment'
            echo "Checking deployment status for \${env.APP_NAME}"
            sh '''
              export KUBECONFIG=\${KUBECONFIG}
              
              echo 'Fetching deployment, service, and ingress status'
              kubectl get deployment,service,ingress -l app=\${APP_NAME}
              
              echo 'Fetching pod status'
              kubectl get pods -l app=\${APP_NAME}
              
              echo 'Deployment verification completed successfully'
            '''
          }
        }
      }
    }

  }
  
  post {
    success {
      script {
        echo 'PIPELINE: Success'
        echo "Deployment completed successfully for \${env.APP_NAME}"
        echo "Service URL: https://\${env.DOMAIN}"
      }
    }
    
    failure {
      script {
        echo 'PIPELINE: Failure'
        echo "Deployment failed for \${env.APP_NAME}"
      }
    }
    
    always {
      script {
        echo 'PIPELINE: Cleanup'
        echo 'Performing post-deployment cleanup tasks'
        sh '''
          echo 'Removing temporary files'
          rm -f deployment.yaml service.yaml certificate.yaml ingress.yaml Dockerfile
          echo 'Cleanup completed'
        '''
      }
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

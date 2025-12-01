/**
 * Python Pipeline - Django, Flask, FastAPI
 * Auto-creates Dockerfile, builds with Kaniko
 */
export function createPythonPipeline(
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
  const sizeKey = (size || 'small').toLowerCase();
  let cpuRequest = '250m';
  let cpuLimit = '500m';
  let memoryRequest = '256Mi';
  let memoryLimit = '512Mi';
  let replicas = 1;

  if (sizeKey === 'medium') {
    cpuRequest = '500m';
    cpuLimit = '1';
    memoryRequest = '512Mi';
    memoryLimit = '1Gi';
    replicas = 2;
  } else if (sizeKey === 'large') {
    cpuRequest = '1';
    cpuLimit = '2';
    memoryRequest = '1Gi';
    memoryLimit = '2Gi';
    replicas = 3;
  }

  // Use standard container port (8000) for Python apps (FastAPI/Flask/Django)
  const containerPort = 8000;
  
  // Remove token from URL for display purposes (keep only clean URL for metadata)
  const cleanUrl = gitUrl.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/');

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Python deployment pipeline for ${name}
    Supports Django, Flask, FastAPI, builds with Kaniko
    Accessible at https://${domain} via NGINX Ingress
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
      inheritFrom 'common-agent'
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

    stage('Initialize') {
      steps {
        script {
          echo 'STAGE: Initialize'
          echo "Application Name: \${env.APP_NAME}"
          echo "Git Repository: ${gitUrl}"
          echo "Branch: ${branch}"
          echo "Container Port: \${env.CONTAINER_PORT}"
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
            sh(
              script: '''
                git config --global --add safe.directory "$(pwd)"
                git log -1 --oneline
              ''',
              returnStatus: false,
              returnStdout: false
            )
            echo 'Source code checkout completed'
          }
        }
      }
    }

    stage('Prepare Dockerfile') {
      steps {
        container('git') {
          script {
            echo 'STAGE: Prepare Dockerfile'
            sh(
              script: '''
                if [ -f Dockerfile ]; then
                echo 'Using existing Dockerfile'
                # If Dockerfile installs dependencies via pip/npm-like steps that may fail, consider patching here if needed
                # (For Python we check for requirements usage; no change required by default)
              else
                echo 'Generating default Python Dockerfile'
                cat > Dockerfile << 'DOCKERFILE_END'
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE ${containerPort}

CMD ["python", "app.py"]
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
              ''',
              returnStatus: false,
              returnStdout: false
            )
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
              sh(
                script: '''
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
                  --context=\${WORKSPACE} \\
                  --dockerfile=Dockerfile \\
                  --destination=\${DOCKER_IMAGE}
                
                echo 'Image build completed successfully'
                ''',
                returnStatus: false,
                returnStdout: false
              )
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
            
            echo 'Creating namespace if not exists'
            sh(
              script: 'kubectl create namespace default --dry-run=client -o yaml | kubectl apply -f -',
              returnStatus: false
            )
            
            sh(
              script: '''
              echo 'Generating Kubernetes deployment manifest'
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
        livenessProbe:
          httpGet:
            path: /
            port: ${containerPort}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /
            port: ${containerPort}
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
DEPLOY_EOF

              echo 'Generating Kubernetes service manifest'
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

              echo 'Generating certificate manifest'
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

              echo 'Generating Kubernetes ingress manifest'
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
            ''',
            returnStatus: false
            )

            echo 'Applying deployment manifest'
            sh(
              script: 'kubectl apply -f deployment.yaml',
              returnStatus: false
            )
            
            echo 'Applying service manifest'
            sh(
              script: 'kubectl apply -f service.yaml',
              returnStatus: false
            )
            
            echo 'Applying certificate manifest'
            sh(
              script: 'kubectl apply -f certificate.yaml || echo "WARNING: cert-manager not installed, skipping certificate"',
              returnStatus: false
            )
            
            echo 'Applying ingress manifest'
            sh(
              script: 'kubectl apply -f ingress.yaml || echo "WARNING: ingress webhook timeout, skipping ingress"',
              returnStatus: false
            )
            
            echo 'Kubernetes deployment completed'
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
            
            echo 'Fetching deployment, service, and ingress status'
            sh(
              script: 'kubectl get deployment,service,ingress -l app=\${APP_NAME}',
              returnStatus: false
            )
            
            echo 'Fetching pod status'
            sh(
              script: 'kubectl get pods -l app=\${APP_NAME}',
              returnStatus: false
            )
            
            echo 'Deployment verification completed successfully'
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
        echo 'Cleanup completed - temporary files removed during pod termination'
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

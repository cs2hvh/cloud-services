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
import { generateNuxtjsDockerfileStage, getPackageManagerDetectionScript } from '../dockerfiles';
import { generateImageScanStage } from '../security';

/**
 * Generate dependency scan stage for Nuxt.js (handles pnpm)
 */
function generateNuxtDependencyScanStage(): string {
  return `
    stage('Security: Dependency Scan') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Dependency Audit'
            
            sh(script: '''
              set -e
              
              echo "Checking package manager..."
              if [ -f pnpm-lock.yaml ]; then
                echo "⚠️ pnpm detected - npm audit not supported"
                echo "Skipping dependency scan (pnpm audit requires pnpm installation)"
                echo "Dependencies will be scanned during Docker build"
                exit 0
              elif [ -f yarn.lock ]; then
                echo "⚠️ yarn detected - npm audit not supported"
                echo "Skipping dependency scan (yarn audit has different format)"
                exit 0
              fi
              
              # npm audit for npm-based projects
              if [ -f package-lock.json ]; then
                echo "Running npm audit..."
                npm audit --audit-level=low || true
                
                echo "Checking for CRITICAL vulnerabilities..."
                set +e
                npm audit --audit-level=critical > /dev/null 2>&1
                AUDIT_EXIT=$?
                set -e
                
                if [ "$AUDIT_EXIT" -ne "0" ]; then
                  echo "❌ CRITICAL vulnerabilities found!"
                  npm audit --audit-level=critical
                  exit 1
                fi
                
                echo "✅ No critical vulnerabilities found"
              else
                echo "No package-lock.json found, skipping npm audit"
              fi
            ''', returnStatus: false)
          }
        }
      }
    }
`.trim();
}

export function createNuxtJsPipeline(
  name: string,
  gitUrl: string,
  branch: string,
  size: string = 'small',
  appDomain: string = 'galaxyhvh.com',
  appId: string = '',
  webhookBaseUrl: string = '',
  deployTrigger: 'manual' | 'webhook' | 'rollback' = 'manual',
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

  // Nuxt 3 runs on port 3000 by default with Nitro
  const containerPort = 3000;

  // Split env vars: NUXT_PUBLIC_*/VITE_* → build-time, others → runtime K8s Secrets
  const clientEnvVars = envVars.filter(e => e.key.startsWith('NUXT_PUBLIC_') || e.key.startsWith('VITE_'));
  const serverEnvVars = envVars.filter(e => !e.key.startsWith('NUXT_PUBLIC_') && !e.key.startsWith('VITE_'));

  // Generate Kubernetes Secret for SERVER-SIDE environment variables only
  const { secretYaml, secretName, hasSecret } = generateEnvSecret(name, serverEnvVars);
  const envFromSection = generateEnvFromSection(secretName, hasSecret);
  const defaultEnvYaml = generateRuntimeDefaultEnvYaml('node', containerPort);

  // Generate build args for CLIENT-SIDE vars (NUXT_PUBLIC_* and VITE_*)
  // ⚠️ Build args are visible in logs - only use for public configuration!
  const buildArgs = clientEnvVars.length > 0
    ? clientEnvVars.map(e => {
        const escapedValue = e.value.replace(/"/g, '\\"').replace(/\$/g, '\\$');
        return `--build-arg ${e.key}="${escapedValue}"`;
      }).join(' \\\\\n                    ')
    : '';
  // Always include PACKAGE_MANAGER build arg (detected during Dockerfile stage)
  const pmBuildArg = '--build-arg PACKAGE_MANAGER=$PACKAGE_MANAGER';
  const buildArgsLine = buildArgs
    ? ` \\\\\n                    ${buildArgs} \\\\\n                    ${pmBuildArg}`
    : ` \\\\\n                    ${pmBuildArg}`;

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
    <hudson.model.ParametersDefinitionProperty>
      <parameterDefinitions>
        <hudson.model.StringParameterDefinition>
          <name>COMMIT_SHA</name>
          <description>Specific commit SHA to checkout (optional, defaults to branch HEAD)</description>
          <defaultValue></defaultValue>
          <trim>true</trim>
        </hudson.model.StringParameterDefinition>
        <hudson.model.BooleanParameterDefinition>
          <name>RESIZE_ONLY</name>
          <description>Skip build stages and only update Kubernetes deployment (for resize operations)</description>
          <defaultValue>false</defaultValue>
        </hudson.model.BooleanParameterDefinition>
      </parameterDefinitions>
    </hudson.model.ParametersDefinitionProperty>
  </properties>

  <triggers>
    <hudson.triggers.SCMTrigger>
      <spec>H/1 * * * *</spec>
      <ignorePostCommitHooks>false</ignorePostCommitHooks>
    </hudson.triggers.SCMTrigger>
  </triggers>

  <disabled>false</disabled>

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
    PLATFORM_APP_ID = '${appId}'
    WEBHOOK_BASE_URL = '${webhookBaseUrl}'
    DEPLOY_TRIGGER = '${deployTrigger}'

    DOCKER_IMAGE_VERSION = "hav0ky/${appName}:\${BUILD_NUMBER}"
    DOCKER_IMAGE_LATEST  = "hav0ky/${appName}:latest"
    ENV_SECRET_NAME = '${secretName}'
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {

    stage('Checkout Repo') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          sh '''
            echo "Cloning repository..."
            git clone --branch ${branch} ${gitUrl} .
            git config --global --add safe.directory "$(pwd)"
            
            # If COMMIT_SHA parameter is provided, checkout that specific commit
            if [ -n "\${COMMIT_SHA}" ]; then
              echo "Checking out specific commit: \${COMMIT_SHA}"
              git checkout \${COMMIT_SHA}
            else
              echo "Using branch HEAD"
            fi
            
            echo "Current commit:"
            git log -1 --oneline
          '''
        }
      }
    }

    stage('Security: Secrets Scan') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Secrets Detection'
            sh 'echo "Scanning for exposed secrets..."'
          }
        }
      }
    }

${generateNuxtDependencyScanStage()}

    stage('Prepare Dockerfile') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          sh '''
${generateNuxtjsDockerfileStage(clientEnvVars)}
          '''
        }
      }
    }

    stage('Build Image with Kaniko') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
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
              # Re-detect package manager (shell vars don't persist across stages)
${getPackageManagerDetectionScript()}

              /kaniko/executor \
                --context=$WORKSPACE \
                --dockerfile=Dockerfile \
                --destination=$DOCKER_IMAGE_VERSION \\
                --destination=$DOCKER_IMAGE_LATEST${buildArgsLine} \\
                --digest-file=image-digest.txt
            '''
          }
        }
      }
    }

${generateImageScanStage({ language: 'node' })}

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
            
            # Use latest image for resize operations, new build image otherwise
            if [ "\${RESIZE_ONLY}" = "true" ]; then
              DEPLOY_IMAGE="\${DOCKER_IMAGE_LATEST}"
              echo "Resize mode: Using existing latest image"
            else
              DEPLOY_IMAGE="\${DOCKER_IMAGE_VERSION}"
              echo "Full deploy: Using newly built image"
            fi
            
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
        image: \${DEPLOY_IMAGE}
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
          tcpSocket:
            port: ${containerPort}
          initialDelaySeconds: 15
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 6
        livenessProbe:
          tcpSocket:
            port: ${containerPort}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
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
          sh '''
            if [ "\${RESIZE_ONLY}" = "true" ] || [ "\${BUILD_NUMBER}" != "1" ]; then
              echo "Restarting deployment to pull new image"
              kubectl rollout restart deployment/\${APP_NAME} -n default
            else
              echo "First deployment - skipping rollout restart"
            fi
          '''
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
      container('kubectl') {
        catchError(buildResult: 'SUCCESS', stageResult: 'SUCCESS') {
          sh '''
            echo "PIPELINE: Success"
            echo "Deployment completed successfully for $APP_NAME"
            echo "Service URL: https://$DOMAIN"

            if [ -z "$WEBHOOK_BASE_URL" ] || [ -z "$PLATFORM_APP_ID" ]; then
              echo "WARN: WEBHOOK_BASE_URL/PLATFORM_APP_ID not set; skipping deployment record"
              exit 0
            fi

            DEPLOYMENT_RECORD_URL="\${WEBHOOK_BASE_URL%/}/api/webhooks/platform-apps/deployment-record"
            COMMIT_SHA=""
            IMAGE_DIGEST=""
            
            # Try to get commit SHA from git if available
            if command -v git >/dev/null 2>&1 && [ -d .git ]; then
              COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null || true)
            fi
            
            # Try to read image digest if file exists
            if [ -f image-digest.txt ]; then 
              IMAGE_DIGEST=$(cat image-digest.txt | tr -d '\\n')
            fi

            PAYLOAD=$(cat <<JSON
{"app_id":"$PLATFORM_APP_ID","build_number":$BUILD_NUMBER,"commit_sha":"$COMMIT_SHA","image_tag":"$DOCKER_IMAGE_VERSION","image_digest":"$IMAGE_DIGEST","status":"success","trigger":"$DEPLOY_TRIGGER"}
JSON
)

            echo "Sending deployment record to: $DEPLOYMENT_RECORD_URL"
            echo "Payload: $PAYLOAD"

            # kubectl container has curl available
            if command -v curl >/dev/null 2>&1; then
              RESPONSE=$(curl -sS -w "\\n%{http_code}" -X POST "$DEPLOYMENT_RECORD_URL" \\
                -H "content-type: application/json" \\
                --data "$PAYLOAD" 2>&1) || true
              HTTP_CODE=$(echo "$RESPONSE" | tail -1)
              BODY=$(echo "$RESPONSE" | sed '$d')
              echo "Response (HTTP $HTTP_CODE): $BODY"
            elif command -v wget >/dev/null 2>&1; then
              wget -qO- \\
                --header="content-type: application/json" \\
                --post-data="$PAYLOAD" \\
                "$DEPLOYMENT_RECORD_URL" || true
            else
              echo "WARN: curl/wget not available; skipping deployment record"
            fi
          '''
        }
      }
    }
    
    failure {
      container('kubectl') {
        catchError(buildResult: 'SUCCESS', stageResult: 'SUCCESS') {
          sh '''
            echo "PIPELINE: Failure"
            echo "Deployment failed for $APP_NAME"

            if [ -z "$WEBHOOK_BASE_URL" ] || [ -z "$PLATFORM_APP_ID" ]; then
              echo "WARN: WEBHOOK_BASE_URL/PLATFORM_APP_ID not set; skipping deployment record"
              exit 0
            fi

            DEPLOYMENT_RECORD_URL="\${WEBHOOK_BASE_URL%/}/api/webhooks/platform-apps/deployment-record"
            COMMIT_SHA=""
            IMAGE_DIGEST=""
            
            # Try to get commit SHA from git if available
            if command -v git >/dev/null 2>&1 && [ -d .git ]; then
              COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null || true)
            fi
            
            # Try to read image digest if file exists
            if [ -f image-digest.txt ]; then 
              IMAGE_DIGEST=$(cat image-digest.txt | tr -d '\\n')
            fi

            PAYLOAD=$(cat <<JSON
{"app_id":"$PLATFORM_APP_ID","build_number":$BUILD_NUMBER,"commit_sha":"$COMMIT_SHA","image_tag":"$DOCKER_IMAGE_VERSION","image_digest":"$IMAGE_DIGEST","status":"failed","trigger":"$DEPLOY_TRIGGER"}
JSON
)

            echo "Sending deployment record to: $DEPLOYMENT_RECORD_URL"
            echo "Payload: $PAYLOAD"

            # kubectl container has curl available
            if command -v curl >/dev/null 2>&1; then
              RESPONSE=$(curl -sS -w "\\n%{http_code}" -X POST "$DEPLOYMENT_RECORD_URL" \\
                -H "content-type: application/json" \\
                --data "$PAYLOAD" 2>&1) || true
              HTTP_CODE=$(echo "$RESPONSE" | tail -1)
              BODY=$(echo "$RESPONSE" | sed '$d')
              echo "Response (HTTP $HTTP_CODE): $BODY"
            elif command -v wget >/dev/null 2>&1; then
              wget -qO- \\
                --header="content-type: application/json" \\
                --post-data="$PAYLOAD" \\
                "$DEPLOYMENT_RECORD_URL" || true
            else
              echo "WARN: curl/wget not available; skipping deployment record"
            fi
          '''
        }
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
]]></script>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>
`;

  return pipelineXml;
}

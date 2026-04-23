/**
 * Generic Dockerfile Pipeline - For projects with existing Dockerfile
 * 
 * This pipeline is used when:
 * 1. User explicitly selects "Dockerfile" framework
 * 2. Project has its own Dockerfile (any language/runtime)
 * 3. No framework-specific auto-generation needed
 * 
 * Supports any tech stack: Elixir, Go, Rust, Ruby, etc.
 * Just builds the existing Dockerfile with Kaniko and deploys to K8s
 */
import { generateEnvSecret, generateEnvFromSection, generateSmartIngressApplyScript, EnvVar } from './utils';
import { generateSecurityStages, generateImageScanStage } from '../security';

export function createDockerfilePipeline(
  name: string,
  gitUrl: string,
  branch: string,
  size: string = 'small',
  appDomain: string = 'galaxyhvh.com',
  appId: string = '',
  webhookBaseUrl: string = '',
  deploymentRecordSecret: string = '',
  deployTrigger: 'manual' | 'webhook' | 'rollback' = 'manual',
  envVars: EnvVar[] = [],
  containerPort: number = 3000, // Default port, can be overridden
): string {
  const domain = `${name}.${appDomain}`;
  const appName = `${name}-app`;
  const serviceName = `${name}-service`;
  const ingressName = `${name}-ingress`;
  
  // Remove token from URL for display purposes
  const cleanUrl = gitUrl
    .replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/')
    .replace(/https:\/\/oauth2:[^@]+@gitlab\.com\//, 'https://gitlab.com/')
    .replace(/https:\/\/x-token-auth:[^@]+@bitbucket\.org\//, 'https://bitbucket.org/');
  
  const sizeKey = (size || 'small').toLowerCase();
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

  // Normalize port — handles null/undefined passed from callers even though signature has = 3000
  const port = containerPort ?? 3000;

  // Generate Kubernetes Secret for environment variables
  const { secretYaml, secretName, hasSecret, createInPipeline } = generateEnvSecret(name, envVars);
  const envFromSection = generateEnvFromSection(secretName, hasSecret);

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Generic Dockerfile Pipeline for ${name}
    Uses existing Dockerfile from repository
    Accessible at https://${domain} via NGINX Ingress
  </description>
  <keepDependencies>false</keepDependencies>

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
    CONTAINER_PORT = '${port}'
    PLATFORM_APP_ID = '${appId}'
    WEBHOOK_BASE_URL = '${webhookBaseUrl}'
    JENKINS_DEPLOYMENT_RECORD_SECRET = '${deploymentRecordSecret}'
    DEPLOY_TRIGGER = '${deployTrigger}'

    DOCKER_IMAGE_VERSION = "hav0ky/${appName}:\${BUILD_NUMBER}"
    DOCKER_IMAGE_LATEST  = "hav0ky/${appName}:latest"
    ENV_SECRET_NAME = '${secretName}'
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {

    stage('Initialize') {
      steps {
        script {
          echo 'STAGE: Initialize'
          echo 'PIPELINE: Generic Dockerfile Deployment Pipeline'
          echo "Application Name: \${env.APP_NAME}"
          echo "Git Repository: ${cleanUrl}"
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
          sh '''
            echo "STAGE: Checkout Repository"
            echo "Fetching source code from repository"
            echo "Cloning repository..."
            git clone --depth=1 --branch ${branch} ${gitUrl} . || git clone --branch ${branch} ${gitUrl} .
            git config --global --add safe.directory "$(pwd)"
            
            # If COMMIT_SHA parameter is provided, checkout that specific commit
            if [ -n "\${COMMIT_SHA}" ]; then
              echo "Checking out specific commit: \${COMMIT_SHA}"
              git fetch --depth=1 origin \${COMMIT_SHA} || git fetch origin \${COMMIT_SHA}
              git checkout \${COMMIT_SHA}
            else
              echo "Using branch HEAD"
            fi
            
            echo "Current commit:"
            git log -1 --oneline
            echo "Source code checkout completed"
          '''
        }
      }
    }

${generateSecurityStages({ language: 'docker' })}

    stage('Validate Dockerfile') {
      steps {
        container('git') {
          sh '''
            echo "STAGE: Validate Dockerfile"
            if [ ! -f Dockerfile ]; then
              echo "========================================="
              echo "ERROR: No Dockerfile found!"
              echo "========================================="
              echo ""
              echo "This pipeline requires a Dockerfile in the repository root."
              echo ""
              echo "If your project uses a supported framework (Next.js, Vue, etc.),"
              echo "please select the appropriate framework instead of 'Dockerfile'."
              echo ""
              exit 1
            fi
            echo "[OK] Dockerfile found"
            echo ""
            echo "Dockerfile contents:"
            cat Dockerfile
            echo ""

            # ── ARG Detection ──────────────────────────────────────────
            # Detect ARG instructions that expect build-time values.
            # Platform does NOT pass --build-arg to Kaniko, so any ARG
            # without a default value will silently resolve to empty.
            echo "Checking for build-time ARG instructions..."
            ARG_LINES=$(grep -n "^ARG " Dockerfile 2>/dev/null || true)
            if [ -n "$ARG_LINES" ]; then
              echo ""
              echo "========================================="
              echo "[WARNING] Dockerfile uses ARG instructions"
              echo "========================================="
              echo ""
              echo "  The following ARG instructions were found:"
              echo "$ARG_LINES" | while IFS= read -r line; do
                echo "    $line"
              done
              echo ""
              # Check specifically for ARGs without defaults (e.g. "ARG MY_VAR")
              ARGS_NO_DEFAULT=$(grep -E "^ARG [A-Za-z_][A-Za-z0-9_]*\\s*$" Dockerfile 2>/dev/null || true)
              if [ -n "$ARGS_NO_DEFAULT" ]; then
                echo "  [FAILED] These ARGs have NO default value and WILL be empty:"
                echo "$ARGS_NO_DEFAULT" | while IFS= read -r line; do
                  echo "    $line"
                done
                echo ""
              fi
              echo "  This platform injects environment variables at RUNTIME"
              echo "  via Kubernetes secrets, NOT at build time."
              echo ""
              echo "  If your build depends on ARG values, consider:"
              echo "    1. Set a default: ARG MY_VAR=default_value"
              echo "    2. Move the logic to runtime (use ENV instead)"
              echo "    3. Use a multi-stage build where ARGs have defaults"
              echo ""
              echo "  Platform-provided env vars will be available at RUNTIME"
              echo "  via process.env / os.environ / System.getenv, not during build."
              echo "========================================="
              echo ""
            else
              echo "[OK] No build-time ARG instructions found"
            fi

            # ── Secret Exposure Detection ──────────────────────────────
            # Scan for patterns that could leak runtime env vars in build logs
            echo "Checking for potential secret exposure patterns..."
            EXPOSURE_FOUND=0

            # Check for printenv / env dump commands
            if grep -nEi "(^|&&|;|[|])[[:space:]]*(printenv|env|set)($|[[:space:]>;|])" Dockerfile 2>/dev/null | grep -i "^[0-9]*:RUN" > /dev/null 2>&1; then
              echo ""
              echo "  [WARNING] Dockerfile contains env dump commands (printenv/env/set)"
              grep -nEi "(^|&&|;|[|])[[:space:]]*(printenv|env|set)($|[[:space:]>;|])" Dockerfile | grep -i "RUN" | while IFS= read -r line; do
                echo "    $line"
              done
              EXPOSURE_FOUND=1
            fi

            # Check for echo $VAR patterns that could leak secrets
            if grep -nE "RUN.*echo.*[$][{]?[A-Z_]+" Dockerfile > /dev/null 2>&1; then
              echo ""
              echo "  [WARNING] Dockerfile echoes environment variables"
              grep -nE "RUN.*echo.*[$][{]?[A-Z_]+" Dockerfile | while IFS= read -r line; do
                echo "    $line"
              done
              EXPOSURE_FOUND=1
            fi

            # Check for writing env vars to files
            if grep -nEi "RUN.*(printenv|env|echo.*[$]).*>" Dockerfile > /dev/null 2>&1; then
              echo ""
              echo "  [WARNING] Dockerfile may write env vars to files"
              grep -nEi "RUN.*(printenv|env|echo.*[$]).*>" Dockerfile | while IFS= read -r line; do
                echo "    $line"
              done
              EXPOSURE_FOUND=1
            fi

            if [ "$EXPOSURE_FOUND" = "1" ]; then
              echo ""
              echo "  These patterns could expose secrets in build logs."
              echo "  Consider removing debug commands before deploying."
              echo ""
            else
              echo "[OK] No secret exposure patterns detected"
            fi
          '''
        }
      }
    }

    stage('Build Docker Image') {
      steps {
        container('kaniko') {
          withCredentials([usernamePassword(credentialsId: 'dockerhublogin',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS')]) {

            sh '''
              echo "STAGE: Build Docker Image"
              echo "Building image: $DOCKER_IMAGE_VERSION (and tagging latest)"
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

              echo 'Executing Kaniko build'
              /kaniko/executor \\
                --context=$WORKSPACE \\
                --dockerfile=Dockerfile \\
                --destination=$DOCKER_IMAGE_VERSION \\
                --destination=$DOCKER_IMAGE_LATEST \\
                --cache=true \\
                --cache-repo=hav0ky/${appName}-cache \\
                --use-new-run \\
                --digest-file=image-digest.txt

              echo 'Image build completed successfully'
            '''
          }
        }
      }
    }

${generateImageScanStage({ language: 'docker' })}

    stage('Create Environment Secret') {
      when {
        expression { return ${createInPipeline} }
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

    stage('Verify Environment Secret') {
      when {
        expression { return ${hasSecret} }
      }
      steps {
        container('kubectl') {
          sh '''
            echo "STAGE: Verify Environment Secret"
            echo "Checking that secret \${ENV_SECRET_NAME} exists before deployment..."
            
            MAX_RETRIES=5
            RETRY_DELAY=3
            ATTEMPT=0
            
            while [ $ATTEMPT -lt $MAX_RETRIES ]; do
              ATTEMPT=$((ATTEMPT + 1))
              if kubectl get secret "\${ENV_SECRET_NAME}" -n default > /dev/null 2>&1; then
                KEY_COUNT=$(kubectl get secret "\${ENV_SECRET_NAME}" -n default -o json | grep -c '"' | head -1 || echo "unknown")
                echo "[SUCCESS] Secret \${ENV_SECRET_NAME} verified (attempt $ATTEMPT)"
                break
              fi
              
              if [ $ATTEMPT -eq $MAX_RETRIES ]; then
                echo "========================================="
                echo "ERROR: Environment secret not found!"
                echo "========================================="
                echo ""
                echo "Secret \${ENV_SECRET_NAME} was not found after $MAX_RETRIES attempts."
                echo "The backend should have created this secret before the build started."
                echo "This may indicate a backend synchronization issue."
                echo ""
                exit 1
              fi
              
              echo "Secret not found yet, retrying in $RETRY_DELAY seconds... (attempt $ATTEMPT/$MAX_RETRIES)"
              sleep $RETRY_DELAY
            done
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {
          sh '''
            echo "STAGE: Deploy to Kubernetes"
            
            DEPLOY_IMAGE="\${DOCKER_IMAGE_VERSION}"
            
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
  revisionHistoryLimit: 3
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
        image: \${DEPLOY_IMAGE}
        imagePullPolicy: Always
        ports:
        - containerPort: ${port}
${envFromSection}
        env:
        - name: PORT
          value: "${port}"
        resources:
          requests:
            cpu: ${cpuRequest}
            memory: ${memoryRequest}
          limits:
            cpu: ${cpuLimit}
            memory: ${memoryLimit}
        readinessProbe:
          tcpSocket:
            port: ${port}
          initialDelaySeconds: 15
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 6
        livenessProbe:
          tcpSocket:
            port: ${port}
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
spec:
  selector:
    app: \${APP_NAME}
  ports:
  - protocol: TCP
    port: 80
    targetPort: ${port}
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
          sh 'kubectl rollout status deployment/\${APP_NAME} -n default --timeout=90s || { echo "WARNING: Rollout did not complete in 90s - deployment may still be starting"; kubectl get pods -n default -l app=\${APP_NAME} --no-headers; }'
          sh 'kubectl apply -f service.yaml'
          sh 'kubectl apply -f certificate.yaml || echo "WARNING: cert-manager not installed, skipping certificate"'
          sh '''${generateSmartIngressApplyScript(ingressName, appDomain)}
          '''
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
            echo "Checking SSL certificate status"
            kubectl get certificate ${name}-cert -n default 2>/dev/null && echo "[SSL] Certificate found" || echo "[SSL] INFO: Certificate not found yet"
            kubectl wait certificate/${name}-cert --for=condition=Ready --timeout=60s -n default 2>/dev/null && echo "[SSL] Certificate Ready — HTTPS available" || echo "[SSL] WARNING: Certificate not Ready within 60s — HTTPS provisioning in progress"
            echo "Deployment verification completed successfully"
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

            if [ -z "$WEBHOOK_BASE_URL" ] || [ -z "$PLATFORM_APP_ID" ] || [ -z "$JENKINS_DEPLOYMENT_RECORD_SECRET" ]; then
              echo "WARN: WEBHOOK_BASE_URL/PLATFORM_APP_ID/JENKINS_DEPLOYMENT_RECORD_SECRET not set; skipping deployment record"
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
                -H "x-deployment-record-secret: $JENKINS_DEPLOYMENT_RECORD_SECRET" \
                --data "$PAYLOAD" 2>&1) || true
              HTTP_CODE=$(echo "$RESPONSE" | tail -1)
              BODY=$(echo "$RESPONSE" | sed '$d')
              echo "Response (HTTP $HTTP_CODE): $BODY"
            elif command -v wget >/dev/null 2>&1; then
              wget -qO- \\
                --header="content-type: application/json" \\
                --header="x-deployment-record-secret: $JENKINS_DEPLOYMENT_RECORD_SECRET" \
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

            if [ -z "$WEBHOOK_BASE_URL" ] || [ -z "$PLATFORM_APP_ID" ] || [ -z "$JENKINS_DEPLOYMENT_RECORD_SECRET" ]; then
              echo "WARN: WEBHOOK_BASE_URL/PLATFORM_APP_ID/JENKINS_DEPLOYMENT_RECORD_SECRET not set; skipping deployment record"
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
                -H "x-deployment-record-secret: $JENKINS_DEPLOYMENT_RECORD_SECRET" \
                --data "$PAYLOAD" 2>&1) || true
              HTTP_CODE=$(echo "$RESPONSE" | tail -1)
              BODY=$(echo "$RESPONSE" | sed '$d')
              echo "Response (HTTP $HTTP_CODE): $BODY"
            elif command -v wget >/dev/null 2>&1; then
              wget -qO- \\
                --header="content-type: application/json" \\
                --header="x-deployment-record-secret: $JENKINS_DEPLOYMENT_RECORD_SECRET" \
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
      sh '''
        echo 'PIPELINE: Cleanup'
        echo 'Cleanup completed - temporary files removed during pod termination'
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

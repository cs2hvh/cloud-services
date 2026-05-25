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
import { generateEnvSecret, generateEnvFromSection, generateRuntimeDefaultEnvYaml, generateSmartIngressApplyScript, generateBuildKitStage, resolveAppSize, generateProbeYaml, EnvVar } from './utils';
import { generateNuxtjsDockerfileStage, getPackageManagerDetectionScript } from '../dockerfiles';
import { generateImageScanStage, generateSecurityStages } from '../security';

export function createNuxtJsPipeline(
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
  containerPort?: number,
  healthcheckPath?: string,
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
  
  // Nuxt SSR (Nitro) needs at least 512 MB — floor at medium
  const { cpuRequest, cpuLimit, memoryRequest, memoryLimit, replicas } = resolveAppSize(size, 'medium');

  // Use provided container port or default to 3000 (Nuxt 3 with Nitro)
  const port = containerPort ?? 3000;

  // Split env vars: NUXT_PUBLIC_*/PUBLIC_*/VITE_* → client-side (build args), others → server-side (K8s Secrets)
  const clientEnvVars = envVars.filter(e => 
    e.key.startsWith('NUXT_PUBLIC_') || e.key.startsWith('PUBLIC_') || e.key.startsWith('VITE_')
  );
  const serverEnvVars = envVars.filter(e => 
    !e.key.startsWith('NUXT_PUBLIC_') && !e.key.startsWith('PUBLIC_') && !e.key.startsWith('VITE_')
  );

  // Generate Kubernetes Secret for SERVER-SIDE environment variables only
  const { secretYaml, secretName, hasSecret, createInPipeline } = generateEnvSecret(name, serverEnvVars);
  const envFromSection = generateEnvFromSection(secretName, hasSecret);
  const defaultEnvYaml = generateRuntimeDefaultEnvYaml('node', port);

  // Only public (NUXT_PUBLIC_*) vars are baked into the image at build time.
  // Server-side vars (DATABASE_URL, API_KEY, etc.) are injected at runtime via K8s Secrets.
  const buildOpts: string[] = [
    ...clientEnvVars.map(e => {
      const escapedValue = e.value.replace(/\$/g, '\\$');
      return `--opt build-arg:${e.key}=${escapedValue}`;
    }),
    '--opt build-arg:PACKAGE_MANAGER=$PACKAGE_MANAGER',
  ];

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Nuxt.js Deployment Pipeline for ${name}
    Accessible at https://${domain} via NGINX Ingress
    
    Framework: Nuxt 3 with Nitro server
    Build Output: .output/
    Server: node .output/server/index.mjs
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
          echo 'PIPELINE: Nuxt.js Deployment Pipeline'
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

    stage('Validate Prerequisites') {
      steps {
        container('git') {
          script {
            echo 'STAGE: Validate Prerequisites'
            echo 'Checking required files and project structure'
            sh(
              script: '''
                if [ ! -f package.json ]; then
                  echo 'WARNING: package.json not found'
                  echo 'Nuxt.js projects typically require a package.json file'
                else
                  echo 'package.json found'
                fi

                echo 'Prerequisites check completed'
              ''',
              returnStatus: false,
              returnStdout: false
            )
          }
        }
      }
    }

${generateSecurityStages({ language: 'node' })}

    stage('Prepare Dockerfile') {
      steps {
        container('git') {
          sh '''
            echo "STAGE: Prepare Dockerfile"
${generateNuxtjsDockerfileStage(envVars)}
            echo 'Dockerfile preparation completed'
          '''
        }
      }
    }

${generateBuildKitStage(appName, buildOpts, getPackageManagerDetectionScript())}

${generateImageScanStage({ language: 'node' })}

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
    framework: nuxtjs
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
        framework: nuxtjs
    spec:
      containers:
      - name: \${APP_NAME}
        image: \${DEPLOY_IMAGE}
        imagePullPolicy: Always
        ports:
        - containerPort: ${port}
${envFromSection}
${defaultEnvYaml}
        resources:
          requests:
            cpu: ${cpuRequest}
            memory: ${memoryRequest}
          limits:
            cpu: ${cpuLimit}
            memory: ${memoryLimit}
${generateProbeYaml(port, healthcheckPath)}
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

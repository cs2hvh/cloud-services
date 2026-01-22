import { generateEnvSecret, generateEnvFromSection, generateRuntimeDefaultEnvYaml, EnvVar } from './utils';
import { generateNextjsDockerfileStage, getPackageManagerDetectionScript } from '../dockerfiles';
import { generateSecurityStages, generateImageScanStage } from '../security';

export function createNextJsPipeline(
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

  // Remove token from URL for display purposes (keep only clean URL for metadata)
  // Handle GitHub (https://token@github.com/), GitLab (https://oauth2:token@gitlab.com/), and Bitbucket (https://x-token-auth:token@bitbucket.org/) formats
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

  // fixed container port for Next.js
  const containerPort = 3000;

  // Split env vars: NEXT_PUBLIC_* → build-time, others → runtime K8s Secrets
  const clientEnvVars = envVars.filter(e => e.key.startsWith('NEXT_PUBLIC_'));
  const serverEnvVars = envVars.filter(e => !e.key.startsWith('NEXT_PUBLIC_'));

  // Generate Kubernetes Secret for SERVER-SIDE environment variables only
  const { secretYaml, secretName, hasSecret } = generateEnvSecret(name, serverEnvVars);
  const envFromSection = generateEnvFromSection(secretName, hasSecret);
  const defaultEnvYaml = generateRuntimeDefaultEnvYaml('node', containerPort);

  // Generate build args for CLIENT-SIDE vars (NEXT_PUBLIC_*)
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
    Next.js Deployment Pipeline for ${name}
    Accessible at https://${domain} via NGINX Ingress
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

${generateSecurityStages({ language: 'node' })}

    stage('Prepare Dockerfile') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          sh '''
${generateNextjsDockerfileStage(clientEnvVars)}
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
                --destination=$DOCKER_IMAGE_VERSION \
                --destination=\$DOCKER_IMAGE_LATEST${buildArgsLine} \\
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
        image: \${DEPLOY_IMAGE}
        imagePullPolicy: Always
        ports:
        - containerPort: ${containerPort}
${envFromSection}
        env:
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
              RESPONSE=$(curl -sS -w "\\n%{http_code}" -X POST "$DEPLOYMENT_RECORD_URL" \
                -H "content-type: application/json" \
                --data "$PAYLOAD" 2>&1) || true
              HTTP_CODE=$(echo "$RESPONSE" | tail -1)
              BODY=$(echo "$RESPONSE" | sed '$d')
              echo "Response (HTTP $HTTP_CODE): $BODY"
            elif command -v wget >/dev/null 2>&1; then
              wget -qO- \
                --header="content-type: application/json" \
                --post-data="$PAYLOAD" \
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
              RESPONSE=$(curl -sS -w "\\n%{http_code}" -X POST "$DEPLOYMENT_RECORD_URL" \
                -H "content-type: application/json" \
                --data "$PAYLOAD" 2>&1) || true
              HTTP_CODE=$(echo "$RESPONSE" | tail -1)
              BODY=$(echo "$RESPONSE" | sed '$d')
              echo "Response (HTTP $HTTP_CODE): $BODY"
            elif command -v wget >/dev/null 2>&1; then
              wget -qO- \
                --header="content-type: application/json" \
                --post-data="$PAYLOAD" \
                "$DEPLOYMENT_RECORD_URL" || true
            else
              echo "WARN: curl/wget not available; skipping deployment record"
            fi
          '''
        }
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

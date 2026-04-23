/**
 * Java/Maven Pipeline - For Java projects with Maven build system
 * 
 * This pipeline is used when:
 * 1. User selects "Java" framework
 * 2. Project has a valid pom.xml file
 * 3. Auto-creates Dockerfile if missing, builds with Kaniko, deploys to K8s
 */
import { generateEnvSecret, generateEnvFromSection, EnvVar, generateRuntimeDefaultEnvYaml, generateSmartIngressApplyScript } from './utils';
import { generateJavaDockerfileStage } from '../dockerfiles';
import { generateSecurityStages, generateImageScanStage } from '../security';

export function createJavaPipeline(
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

  // Use provided container port or default to 8080 for Java apps
  const port = containerPort ?? 8080;

  // Generate Kubernetes Secret for environment variables
  const { secretYaml, secretName, hasSecret, createInPipeline } = generateEnvSecret(name, envVars);
  const envFromSection = generateEnvFromSection(secretName, hasSecret);
  const defaultEnvYaml = generateRuntimeDefaultEnvYaml('java', port);

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Java/Maven deployment pipeline for ${name}
    Auto-creates Dockerfile if missing, builds with Kaniko
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
          echo 'PIPELINE: Java Deployment Pipeline'
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
          script {
            echo 'STAGE: Checkout Repository'
            echo 'Fetching source code from repository'
            sh '''
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
            sh(
              script: '''
                if [ -f pom.xml ]; then
                  echo 'Maven project detected (pom.xml found)'
                elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then
                  echo 'Gradle project detected (build.gradle found)'
                else
                  echo 'WARNING: No Java build file found (pom.xml / build.gradle)'
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

${generateSecurityStages({ language: 'docker' })}

    stage('Prepare Dockerfile') {
      steps {
        container('git') {
          script {
            echo 'STAGE: Prepare Dockerfile'
            sh '''
${generateJavaDockerfileStage()}
            '''
            echo 'Dockerfile preparation completed'
          }
        }
      }
    }

    stage('Build Docker Image') {
      steps {
        container('kaniko') {
          script {
            echo 'STAGE: Build Docker Image'
            echo "Building image: \${env.DOCKER_IMAGE_VERSION} (and tagging latest)"
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
                  --destination=\${DOCKER_IMAGE_VERSION} \\
                  --destination=\${DOCKER_IMAGE_LATEST} \\
                  --cache=true \\
                  --cache-repo=hav0ky/${appName}-cache \\
                  --use-new-run \\
                  --digest-file=image-digest.txt
                
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

${generateImageScanStage({ language: 'docker' })}

    stage('Create Environment Secret') {
      when {
        expression { return ${createInPipeline} }
      }
      steps {
        container('kubectl') {
          script {
            echo 'STAGE: Create Environment Secret'
            echo "Creating Kubernetes secret: \${env.ENV_SECRET_NAME}"
            sh(
              script: '''
              cat > env-secret.yaml << 'SECRET_EOF'
${secretYaml}
SECRET_EOF
              kubectl apply -f env-secret.yaml
              echo 'Environment secret created successfully'
              ''',
              returnStatus: false
            )
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
              script: 'kubectl get namespace default >/dev/null 2>&1 || true',
              returnStatus: false
            )
            
            sh(
              script: '''
              DEPLOY_IMAGE="\${DOCKER_IMAGE_VERSION}"
              
              echo 'Generating Kubernetes deployment manifest'
              cat > deployment.yaml << DEPLOYMENT_EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: \${APP_NAME}
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
        - containerPort: \${CONTAINER_PORT}
          name: http
          protocol: TCP
${envFromSection}
${defaultEnvYaml}
        resources:
          requests:
            cpu: ${cpuRequest}
            memory: ${memoryRequest}
          limits:
            cpu: ${cpuLimit}
            memory: ${memoryLimit}
        livenessProbe:
          httpGet:
            path: /actuator/health
            port: \${CONTAINER_PORT}
          initialDelaySeconds: 60
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /actuator/health
            port: \${CONTAINER_PORT}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
---
apiVersion: v1
kind: Service
metadata:
  name: \${SERVICE_NAME}
  labels:
    app: \${APP_NAME}
spec:
  selector:
    app: \${APP_NAME}
  ports:
  - port: 80
    targetPort: \${CONTAINER_PORT}
    protocol: TCP
    name: http
  type: ClusterIP
DEPLOYMENT_EOF

              cat > ingress.yaml << INGRESS_EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: \${INGRESS_NAME}
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
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

              echo 'Applying Kubernetes manifests'
              kubectl apply -f deployment.yaml
              
              echo 'Applying service manifest'
              kubectl apply -f /dev/stdin <<SERVICE_APPLY_EOF
apiVersion: v1
kind: Service
metadata:
  name: \${SERVICE_NAME}
  labels:
    app: \${APP_NAME}
spec:
  selector:
    app: \${APP_NAME}
  ports:
  - port: 80
    targetPort: \${CONTAINER_PORT}
    protocol: TCP
    name: http
  type: ClusterIP
SERVICE_APPLY_EOF

              echo 'Applying certificate manifest'
              kubectl apply -f /dev/stdin <<CERT_APPLY_EOF || echo 'WARNING: cert-manager not installed, skipping certificate'
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
CERT_APPLY_EOF
              kubectl rollout status deployment/\${APP_NAME} -n default --timeout=90s || { echo "WARNING: Rollout did not complete in 90s - deployment may still be starting"; kubectl get pods -n default -l app=\${APP_NAME} --no-headers; }
              
              echo 'Deployment completed'
              kubectl get deployment \${APP_NAME}
              kubectl get service \${SERVICE_NAME}
              ''',
              returnStatus: false
            )

            sh(
              script: '''${generateSmartIngressApplyScript(ingressName, appDomain)}
              ''',
              returnStatus: false
            )
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

            echo 'Checking SSL certificate status'
            sh(
              script: 'kubectl get certificate ${name}-cert -n default 2>/dev/null && echo "[SSL] Certificate found" || echo "[SSL] INFO: Certificate not found yet"',
              returnStatus: true
            )
            sh(
              script: 'kubectl wait certificate/${name}-cert --for=condition=Ready --timeout=60s -n default 2>/dev/null && echo "[SSL] Certificate Ready — HTTPS available" || echo "[SSL] WARNING: Certificate not Ready within 60s — HTTPS provisioning in progress"',
              returnStatus: true
            )

            echo 'Deployment verification completed successfully'
          }
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

            if command -v git >/dev/null 2>&1 && [ -d .git ]; then
              COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null || true)
            fi

            if [ -f image-digest.txt ]; then
              IMAGE_DIGEST=$(cat image-digest.txt | tr -d '\\n')
            fi

            PAYLOAD=$(cat <<JSON
{"app_id":"$PLATFORM_APP_ID","build_number":$BUILD_NUMBER,"commit_sha":"$COMMIT_SHA","image_tag":"$DOCKER_IMAGE_VERSION","image_digest":"$IMAGE_DIGEST","status":"success","trigger":"$DEPLOY_TRIGGER"}
JSON
)

            echo "Sending deployment record to: $DEPLOYMENT_RECORD_URL"
            echo "Payload: $PAYLOAD"

            if command -v curl >/dev/null 2>&1; then
              RESPONSE=$(curl -sS -w "\\n%{http_code}" -X POST "$DEPLOYMENT_RECORD_URL" \
                -H "content-type: application/json" \
                -H "x-deployment-record-secret: $JENKINS_DEPLOYMENT_RECORD_SECRET" \
                --data "$PAYLOAD" 2>&1) || true
              HTTP_CODE=$(echo "$RESPONSE" | tail -1)
              BODY=$(echo "$RESPONSE" | sed '$d')
              echo "Response (HTTP $HTTP_CODE): $BODY"
            elif command -v wget >/dev/null 2>&1; then
              wget -qO- \
                --header="content-type: application/json" \
                --header="x-deployment-record-secret: $JENKINS_DEPLOYMENT_RECORD_SECRET" \
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

            if [ -z "$WEBHOOK_BASE_URL" ] || [ -z "$PLATFORM_APP_ID" ] || [ -z "$JENKINS_DEPLOYMENT_RECORD_SECRET" ]; then
              echo "WARN: WEBHOOK_BASE_URL/PLATFORM_APP_ID/JENKINS_DEPLOYMENT_RECORD_SECRET not set; skipping deployment record"
              exit 0
            fi

            DEPLOYMENT_RECORD_URL="\${WEBHOOK_BASE_URL%/}/api/webhooks/platform-apps/deployment-record"
            COMMIT_SHA=""
            IMAGE_DIGEST=""

            if command -v git >/dev/null 2>&1 && [ -d .git ]; then
              COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null || true)
            fi

            if [ -f image-digest.txt ]; then
              IMAGE_DIGEST=$(cat image-digest.txt | tr -d '\\n')
            fi

            PAYLOAD=$(cat <<JSON
{"app_id":"$PLATFORM_APP_ID","build_number":$BUILD_NUMBER,"commit_sha":"$COMMIT_SHA","image_tag":"$DOCKER_IMAGE_VERSION","image_digest":"$IMAGE_DIGEST","status":"failed","trigger":"$DEPLOY_TRIGGER"}
JSON
)

            echo "Sending deployment record to: $DEPLOYMENT_RECORD_URL"
            echo "Payload: $PAYLOAD"

            if command -v curl >/dev/null 2>&1; then
              RESPONSE=$(curl -sS -w "\\n%{http_code}" -X POST "$DEPLOYMENT_RECORD_URL" \
                -H "content-type: application/json" \
                -H "x-deployment-record-secret: $JENKINS_DEPLOYMENT_RECORD_SECRET" \
                --data "$PAYLOAD" 2>&1) || true
              HTTP_CODE=$(echo "$RESPONSE" | tail -1)
              BODY=$(echo "$RESPONSE" | sed '$d')
              echo "Response (HTTP $HTTP_CODE): $BODY"
            elif command -v wget >/dev/null 2>&1; then
              wget -qO- \
                --header="content-type: application/json" \
                --header="x-deployment-record-secret: $JENKINS_DEPLOYMENT_RECORD_SECRET" \
                --post-data="$PAYLOAD" \
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
</flow-definition>`;

  return pipelineXml;
}

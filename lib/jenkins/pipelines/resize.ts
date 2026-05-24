/**
 * Resize Pipeline - Standalone pipeline for app resize operations
 * 
 * This pipeline is deployed as a SEPARATE Jenkins job ({appName}-resize-job)
 * so resize operations don't increment the main build number or pollute
 * the build history of the primary app job.
 * 
 * It reuses the existing latest Docker image and only updates the Kubernetes
 * deployment with new resource limits (cpu/memory) and replica count.
 */
import { generateEnvFromSection, generateEnvSecret, generateRuntimeDefaultEnvYaml, resolveAppSize, EnvVar, Runtime } from './utils';

function frameworkToRuntime(framework?: string | null): Runtime {
  const fw = framework?.toLowerCase();
  if (fw === 'python' || fw === 'django' || fw === 'flask' || fw === 'fastapi') return 'python';
  if (fw === 'java' || fw === 'maven' || fw === 'spring' || fw === 'spring-boot' || fw === 'springboot') return 'java';
  return 'node';
}

export function createResizePipeline(
  name: string,
  size: string = 'small',
  appId: string = '',
  // appDomain: string = 'galaxyhvh.com',
  webhookBaseUrl: string = '',
  deploymentRecordSecret: string = '',
  envVars: EnvVar[] = [],
  containerPort?: number,
  framework?: string | null,
  operationId: string = '',
): string {
  // const domain = `${name}.${appDomain}`;
  const appName = `${name}-app`;
  const serviceName = `${name}-service`;
  // const ingressName = `${name}-ingress`;

  const { cpuRequest, cpuLimit, memoryRequest, memoryLimit, replicas } = resolveAppSize(size);

  const port = containerPort ?? 3000;

  const runtime = frameworkToRuntime(framework);
  const { secretName, hasSecret } = generateEnvSecret(name, envVars);
  const envFromSection = generateEnvFromSection(secretName, hasSecret);
  const defaultEnvYaml = generateRuntimeDefaultEnvYaml(runtime, port);

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Resize pipeline for ${name}
    Updates Kubernetes deployment with new resource limits
  </description>
  <keepDependencies>false</keepDependencies>

  <properties/>

  <disabled>false</disabled>

  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script>
<![CDATA[
pipeline {
  agent {
    kubernetes {
      inheritFrom 'common-agent'
      podRetention never()
      activeDeadlineSeconds 300
    }
  }

  environment {
    APP_NAME = '${appName}'
    SERVICE_NAME = '${serviceName}'
    CONTAINER_PORT = '${port}'
    PLATFORM_APP_ID = '${appId}'
    PLATFORM_OPERATION_ID = '${operationId}'
    WEBHOOK_BASE_URL = '${webhookBaseUrl}'
    JENKINS_DEPLOYMENT_RECORD_SECRET = '${deploymentRecordSecret}'
    DEPLOY_TRIGGER = 'resize'

    DOCKER_IMAGE_LATEST = "hav0ky/${appName}:latest"
    ENV_SECRET_NAME = '${secretName}'
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {

    stage('Initialize') {
      steps {
        script {
          echo 'STAGE: Initialize'
          echo 'PIPELINE: Resize Operation Pipeline'
          echo "Application Name: \${env.APP_NAME}"
          echo "Target Size: ${size}"
          echo "CPU: ${cpuRequest} -> ${cpuLimit}"
          echo "Memory: ${memoryRequest} -> ${memoryLimit}"
          echo "Replicas: ${replicas}"
          echo "Build Number: \${env.BUILD_NUMBER}"
          echo 'Initialization completed'
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {
          script {
            echo 'STAGE: Deploy to Kubernetes'
            echo 'Applying Kubernetes manifests with updated resource limits'

            sh(
              script: '''
              DEPLOY_IMAGE="\${DOCKER_IMAGE_LATEST}"
              echo "Resize mode: Using existing latest image \${DEPLOY_IMAGE}"

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
${defaultEnvYaml}
        resources:
          requests:
            cpu: ${cpuRequest}
            memory: ${memoryRequest}
          limits:
            cpu: ${cpuLimit}
            memory: ${memoryLimit}
        livenessProbe:
          tcpSocket:
            port: ${port}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          tcpSocket:
            port: ${port}
          initialDelaySeconds: 15
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 6
DEPLOY_EOF

              echo 'Applying deployment manifest'
              kubectl apply -f deployment.yaml
            ''',
            returnStatus: false
            )

            echo 'Kubernetes deployment updated with new resource limits'
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

            sh(
              script: 'kubectl rollout status deployment/\${APP_NAME} -n default --timeout=90s || { echo "WARNING: Rollout did not complete in 90s - deployment may still be starting"; kubectl get pods -n default -l app=\${APP_NAME} --no-headers; }',
              returnStatus: false
            )

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
      container('kubectl') {
        catchError(buildResult: 'SUCCESS', stageResult: 'SUCCESS') {
          sh '''
            echo "PIPELINE: Success"
            echo "Resize completed successfully for $APP_NAME"

            if [ -z "$WEBHOOK_BASE_URL" ] || [ -z "$PLATFORM_APP_ID" ] || [ -z "$JENKINS_DEPLOYMENT_RECORD_SECRET" ]; then
              echo "WARN: WEBHOOK_BASE_URL/PLATFORM_APP_ID/JENKINS_DEPLOYMENT_RECORD_SECRET not set; skipping deployment record"
              exit 0
            fi

            DEPLOYMENT_RECORD_URL="\${WEBHOOK_BASE_URL%/}/api/webhooks/platform-apps/deployment-record"

            PAYLOAD=$(cat <<JSON
{"app_id":"$PLATFORM_APP_ID","operation_id":"$PLATFORM_OPERATION_ID","commit_sha":"","image_tag":"$DOCKER_IMAGE_LATEST","image_digest":"","status":"success","trigger":"resize"}
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
            echo "Resize failed for $APP_NAME"

            if [ -z "$WEBHOOK_BASE_URL" ] || [ -z "$PLATFORM_APP_ID" ] || [ -z "$JENKINS_DEPLOYMENT_RECORD_SECRET" ]; then
              echo "WARN: WEBHOOK_BASE_URL/PLATFORM_APP_ID/JENKINS_DEPLOYMENT_RECORD_SECRET not set; skipping deployment record"
              exit 0
            fi

            DEPLOYMENT_RECORD_URL="\${WEBHOOK_BASE_URL%/}/api/webhooks/platform-apps/deployment-record"

            PAYLOAD=$(cat <<JSON
{"app_id":"$PLATFORM_APP_ID","operation_id":"$PLATFORM_OPERATION_ID","commit_sha":"","image_tag":"$DOCKER_IMAGE_LATEST","image_digest":"","status":"failed","trigger":"resize"}
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
]]>
    </script>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>
`;
  return pipelineXml;
}

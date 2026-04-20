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
            echo 'Source code checkout completed'
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
            echo 'Dockerfile prepared successfully'
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
    secretName: \${APP_NAME}-tls
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
              
              echo 'Waiting for deployment rollout'
              kubectl rollout status deployment/\${APP_NAME} --timeout=5m || true
              
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

    stage('Send Deployment Notification') {
      when {
        expression { return env.WEBHOOK_BASE_URL && env.PLATFORM_APP_ID && env.JENKINS_DEPLOYMENT_RECORD_SECRET }
      }
      steps {
        script {
          echo 'STAGE: Send Deployment Notification'
          def status = currentBuild.result ?: 'SUCCESS'
          def buildUrl = "\${env.BUILD_URL}"
          def webhookUrl = "\${env.WEBHOOK_BASE_URL}/api/services/platform-apps/\${env.PLATFORM_APP_ID}/builds"
          def payload = """{"buildNumber":\${env.BUILD_NUMBER},"status":"SUCCESS","trigger":"\${env.DEPLOY_TRIGGER}","jenkinsUrl":"\${buildUrl}"}"""
          
          sh(script: """
            curl -X POST "\${webhookUrl}" \\
              -H "Content-Type: application/json" \\
              -H "x-deployment-record-secret: \${env.JENKINS_DEPLOYMENT_RECORD_SECRET}" \\
              -d '\${payload}' || echo 'Webhook notification failed (non-blocking)'
          """, returnStatus: false)
          
          echo 'Notification sent'
        }
      }
    }
  }

  post {
    failure {
      script {
        echo 'Pipeline failed - sending failure notification'
        if (env.WEBHOOK_BASE_URL && env.PLATFORM_APP_ID && env.JENKINS_DEPLOYMENT_RECORD_SECRET) {
          def webhookUrl = "\${env.WEBHOOK_BASE_URL}/api/services/platform-apps/\${env.PLATFORM_APP_ID}/builds"
          def payload = """{"buildNumber":\${env.BUILD_NUMBER},"status":"FAILED","trigger":"\${env.DEPLOY_TRIGGER}","jenkinsUrl":"\${env.BUILD_URL}"}"""
          sh(script: """
            curl -X POST "\${webhookUrl}" \\
              -H "Content-Type: application/json" \\
              -H "x-deployment-record-secret: \${env.JENKINS_DEPLOYMENT_RECORD_SECRET}" \\
              -d '\${payload}' || echo 'Failure webhook failed (non-blocking)'
          """, returnStatus: false)
        }
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

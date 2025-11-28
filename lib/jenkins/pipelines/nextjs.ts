export function createNextJsPipeline(
  name: string,
  gitUrl: string,
  branch: string,
  nodePort: string,
  size: string = 'small',
): string {
  const domain = `${name}.uizb210.xyz`;
  const appName = `${name}-app`;
  const serviceName = `${name}-service`;

  // sanitize git url
  const cleanUrl = gitUrl.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/');
  const sizeKey = (size || 'small').toLowerCase();

  let cpuRequest = '500m';
  let cpuLimit = '1';
  let memoryRequest = '512Mi';
  let memoryLimit = '1Gi';
  let replicas = 1;

  if (sizeKey === 'medium') {
    cpuRequest = '1';
    cpuLimit = '2';
    memoryRequest = '1Gi';
    memoryLimit = '2Gi';
    replicas = 2;
  } else if (sizeKey === 'large') {
    cpuRequest = '1.5';
    cpuLimit = '3';
    memoryRequest = '2Gi';
    memoryLimit = '3Gi';
    replicas = 3;
  }

  // fixed container port for Next.js
  const containerPort = 3000;

  // validate nodePort: only include if numeric and between 30000 and 32767
  let nodePortYaml = '';
  const npNum = parseInt(nodePort || '', 10);
  if (!isNaN(npNum) && npNum >= 30000 && npNum <= 32767) {
    nodePortYaml = `    nodePort: ${npNum}\n`;
  } else if (nodePort && nodePort.trim().length > 0) {
    // invalid nodePort supplied — we intentionally omit it so k8s assigns one
    nodePortYaml = `    # nodePort omitted (invalid value supplied: ${nodePort})\n`;
  }

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <description>
    Next.js Deployment Pipeline for ${name}
  </description>

  <properties>
    <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github@1.34.4">
      <projectUrl>${cleanUrl}</projectUrl>
    </com.coravy.hudson.plugins.github.GithubProjectProperty>
  </properties>

  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script><![CDATA[
pipeline {
  agent {
    kubernetes {
      inheritFrom 'common-agent'
    }
  }

  environment {
    APP_NAME = '${appName}'
    SERVICE_NAME = '${serviceName}'
    NODE_PORT = '${nodePort}'
    CONTAINER_PORT = '${containerPort}'
    DOCKER_IMAGE = "hav0ky/${appName}:latest"
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {

    stage('Checkout Repo') {
      steps {
        container('git') {
          git branch: '${branch}', url: '${gitUrl}'
        }
      }
    }

    stage('Prepare Dockerfile') {
      steps {
        container('git') {
          script {
            sh '''
              if [ -f Dockerfile ]; then
                echo "Using existing Dockerfile"
              else
                echo "Creating default Next.js Dockerfile (Node 20 required)"

cat > Dockerfile << 'EOF'
# ---- Build Stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ---- Run Stage ----
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/public ./public

RUN npm install --only=production

# Next.js listens on container port 3000
EXPOSE 3000
ENV PORT=3000
CMD ["npm", "start"]
EOF
              fi
            '''
          }
        }
      }
    }

    stage('Build Image with Kaniko') {
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

              /kaniko/executor \
                --context=$WORKSPACE \
                --dockerfile=Dockerfile \
                --destination=$DOCKER_IMAGE
            '''
          }
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {

          sh """
cat > deployment.yaml <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: \${APP_NAME}
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
        readinessProbe:
          httpGet:
            path: /
            port: ${containerPort}
          initialDelaySeconds: 5
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /
            port: ${containerPort}
          initialDelaySeconds: 15
          periodSeconds: 20
EOF
"""

          sh """
cat > service.yaml <<EOF
apiVersion: v1
kind: Service
metadata:
  name: \${SERVICE_NAME}
spec:
  selector:
    app: \${APP_NAME}
  type: NodePort
  ports:
  - port: ${containerPort}
    targetPort: ${containerPort}
${nodePortYaml}EOF
"""

          sh "kubectl apply -f deployment.yaml"
          sh "kubectl apply -f service.yaml"
        }
      }
    }

  }

  post {
    success {
      echo "Deployment successful! NodePort URL:"
      container('kubectl') {
        sh '''
          echo "============================="
          echo "     CLUSTER NODE INFO"
          echo "============================="
          kubectl get nodes -o wide

          echo "============================="
          echo "      SERVICE DETAILS"
          echo "============================="
          kubectl get svc
        '''
      }
    }
  }
}
]]></script>
  </definition>
</flow-definition>
`;

  return pipelineXml;
}

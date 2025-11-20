/**
 * Node.js Pipeline - Next.js, React, Vue.js, Express
 * Builds Docker image using Kaniko and deploys to Kubernetes
 */
export function createNodeJsPipeline(
  name: string,
  gitUrl: string,
  branch: string,
  nodePort: string,
): string {
  const domain = `${name}.uizb210.xyz`;
  const appName = `${name}-app`;
  const serviceName = `${name}-service`;
  const ingressName = `${name}-ingress`;

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Node.js deployment pipeline for ${name}
    Builds image with Kaniko, deploys to Kubernetes
    Accessible at https://${domain} (port ${nodePort})
  </description>
  <keepDependencies>false</keepDependencies>

  <properties>
    <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github@1.34.4">
      <projectUrl>${gitUrl}</projectUrl>
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
  - name: kubectl
    image: bitnami/kubectl:latest
    command:
    - cat
    tty: true
  volumes:
  - name: docker-config
    secret:
      secretName: docker-config
      optional: true
"""
    }
  }

  environment {
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {

    stage('Clone Repository') {
      steps {
        container('git') {
          echo 'Cloning repository...'
          git branch: '${branch}', url: '${gitUrl}'
        }
      }
    }

    stage('Validate Dockerfile') {
      steps {
        container('git') {
          echo 'Checking for Dockerfile...'
          sh '''
            if [ ! -f Dockerfile ]; then
              echo "ERROR: No Dockerfile found!"
              echo "Please add a Dockerfile to your repository"
              exit 1
            fi
            echo "✓ Dockerfile found"
            cat Dockerfile
          '''
        }
      }
    }

    stage('Build & Push Image') {
      steps {
        container('kaniko') {
          echo 'Building and pushing image with Kaniko...'
          withCredentials([usernamePassword(
            credentialsId: 'dockerhublogin',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS'
          )]) {
            sh '''
              mkdir -p /kaniko/.docker
              echo "{\\"auths\\":{\\"https://index.docker.io/v1/\\":{\\"auth\\":\\"$(echo -n $DOCKER_USER:$DOCKER_PASS | base64)\\"}}" > /kaniko/.docker/config.json
              /kaniko/executor --context=\\$PWD --dockerfile=Dockerfile --destination=hav0ky/${appName}:latest
            '''
          }
        }
      }
    }

    stage('Deploy to Kubernetes') {
      steps {
        container('kubectl') {
          echo 'Deploying to Kubernetes...'
          sh '''
          # Apply Deployment
          cat <<EOF | kubectl apply -f - --kubeconfig=\$KUBECONFIG
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
  namespace: default
  labels:
    app: ${appName}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
      - name: ${appName}
        image: \${IMAGE_TAG}
        imagePullPolicy: Always
        ports:
        - containerPort: ${nodePort}
        env:
        - name: PORT
          value: "${nodePort}"
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
            port: ${nodePort}
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /
            port: ${nodePort}
          initialDelaySeconds: 10
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
EOF

          # Apply Service
          cat <<EOF | kubectl apply -f - --kubeconfig=\$KUBECONFIG
apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
  namespace: default
spec:
  selector:
    app: ${appName}
  ports:
  - protocol: TCP
    port: ${nodePort}
    targetPort: ${nodePort}
    nodePort: ${nodePort}
  type: NodePort
EOF

          # Apply Certificate
          cat <<EOF | kubectl apply -f - --kubeconfig=\$KUBECONFIG
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
  - ${domain}
EOF

          # Apply Ingress
          cat <<EOF | kubectl apply -f - --kubeconfig=\$KUBECONFIG
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${ingressName}
  namespace: default
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - ${domain}
    secretName: ${name}-tls
  rules:
  - host: ${domain}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: ${serviceName}
            port:
              number: ${nodePort}
EOF

          echo "✓ Deployment completed!"
        '''
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        container('kubectl') {
          echo 'Verifying deployment...'
          sh '''
          echo "=== Deployment Status ==="
          kubectl get deployment ${appName} --kubeconfig=\$KUBECONFIG || echo "Deployment not found"
          
          echo ""
          echo "=== Service Status ==="
          kubectl get service ${serviceName} --kubeconfig=\$KUBECONFIG || echo "Service not found"
          
          echo ""
          echo "=== Ingress Status ==="
          kubectl get ingress ${ingressName} --kubeconfig=\$KUBECONFIG || echo "Ingress not found"
          
          echo ""
          echo "=== Pods ==="
          kubectl get pods -l app=${appName} --kubeconfig=\$KUBECONFIG || echo "No pods found"
        '''
        }
      }
    }

  }
  
  post {
    success {
      echo '✓ Node.js deployment successful!'
      echo 'Access your app at: https://${domain}'
    }
    failure {
      echo '✗ Deployment failed. Check logs above.'
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

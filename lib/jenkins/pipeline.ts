export function createPipelineXml(
  name: string,
  gitUrl: string,
  branch: string,
  nodePort: string, // e.g. "31955"
): string {
  const domain = `${name}.uizb210.xyz`;
  const appName = `${name}-app`;
  const serviceName = `${name}-service`;
  const ingressName = `${name}-ingress`;

  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    This job builds and pushes a Docker image, deploys an app on port 3000,
    creates a NodePort Service with nodePort ${nodePort}, and sets up an NGINX Ingress to expose the app at
    https://${domain} using cert-manager with the existing ClusterIssuer (letsencrypt-prod).
    Ensure the DNS A record for ${domain} points to your Ingress Controller's external IP.
  </description>
  <keepDependencies>false</keepDependencies>

  <!-- (Optional) GitHub project property -->
  <properties>
    <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github@1.34.4">
      <projectUrl>${gitUrl}</projectUrl>
    </com.coravy.hudson.plugins.github.GithubProjectProperty>
  </properties>

  <!-- Poll SCM every minute so Jenkins can detect changes -->
  <triggers>
    <hudson.triggers.SCMTrigger>
      <spec>H/1 * * * *</spec>
      <ignorePostCommitHooks>false</ignorePostCommitHooks>
    </hudson.triggers.SCMTrigger>
  </triggers>

  <disabled>false</disabled>

  <!-- Declarative Pipeline definition -->
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script>
<![CDATA[
pipeline {
  agent any

  environment {
    // Credential holding your kubeconfig
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {

    stage('Clone Repository') {
      steps {
        echo 'Cloning the repository...'
        // Checking out the specified branch
        git branch: '${branch}', url: '${gitUrl}'
      }
    }

    stage('Build Docker Image') {
      steps {
        echo 'Building the Docker image...'
        sh '''
          docker build -t hav0ky/${appName}:latest .
        '''
      }
    }

    stage('Push Docker Image') {
      steps {
        echo 'Pushing the Docker image to Docker Hub...'
        withCredentials([usernamePassword(credentialsId: 'dockerhublogin', 
                                            usernameVariable: 'DOCKER_USER', 
                                            passwordVariable: 'DOCKER_PASS')]) {
          sh '''
            echo $DOCKER_PASS | docker login -u $DOCKER_USER --password-stdin
            docker push hav0ky/${appName}:latest
          '''
        }
      }
    }

    stage('Deploy to Kubernetes') {
      agent {
        docker {
          image 'bitnami/kubectl:latest'
          // Escape $ to prevent early interpolation
          args "--entrypoint='' -v \\$KUBECONFIG:\\$KUBECONFIG"
        }
      }
      steps {
        echo 'Deploying resources to Kubernetes...'
        sh '''
          echo "Using KUBECONFIG file: $KUBECONFIG"

          # (A) Apply Certificate to obtain SSL for ${domain} (using existing ClusterIssuer "letsencrypt-prod")
          cat <<EOF | kubectl apply -f - --kubeconfig=$KUBECONFIG
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: letsencrypt-nginx
  namespace: default
spec:
  secretName: letsencrypt-nginx
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - ${domain}
EOF

          # (B) Apply Deployment
          cat <<EOF | kubectl apply -f - --kubeconfig=$KUBECONFIG
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
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
        image: hav0ky/${appName}:latest
        ports:
          - containerPort: ${nodePort}
EOF

          # (C) Apply Service (NodePort) with explicit nodePort
          cat <<EOF | kubectl apply -f - --kubeconfig=$KUBECONFIG
apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
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

          # (D) Apply Ingress to expose ${domain} on ports 80/443
          cat <<EOF | kubectl apply -f - --kubeconfig=$KUBECONFIG
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${ingressName}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - ${domain}
      secretName: letsencrypt-nginx
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
        '''
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

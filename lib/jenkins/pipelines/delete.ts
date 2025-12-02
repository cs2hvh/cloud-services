/**
 * Delete Pipeline - Deletes Kubernetes resources for an app
 * Uses lightweight pod template (only kubectl, ~256MB) instead of full common-agent (~4GB)
 * Deletes: Deployment, Service, Ingress, Certificate, and TLS Secret
 */
export function createDeletePipeline(
  name: string,
  size: string = 'small',
  appDomain: string = 'galaxyhvh.com',
): string {
  const domain = `${name}.${appDomain}`;
  const appName = `${name}-app`;  // Match the deployment naming convention
  const serviceName = `${name}-service`;
  const ingressName = `${name}-ingress`;
  const certName = `${name}-cert`;  // Certificate name
  const tlsSecretName = `${name}-tls`;  // TLS secret name
  
  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Delete pipeline for ${name}
    Deletes: Deployment, Service, Ingress, Certificate, TLS Secret
  </description>
  <keepDependencies>false</keepDependencies>

  <properties>
    <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github@1.34.4">
      <projectUrl>https://github.com/hav0k-studios/cloud-services</projectUrl>
    </com.coravy.hudson.plugins.github.GithubProjectProperty>
  </properties>

  <triggers/>

  <disabled>false</disabled>

  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script>
<![CDATA[
pipeline {
  agent {
    kubernetes {
      podRetention never()
      activeDeadlineSeconds 300
      yaml '''
apiVersion: v1
kind: Pod
metadata:
  labels:
    jenkins-agent: delete-agent
spec:
  activeDeadlineSeconds: 300
  containers:
  - name: kubectl
    image: alpine/k8s:1.28.0
    command:
    - cat
    tty: true
    resources:
      requests:
        memory: "64Mi"
        cpu: "50m"
      limits:
        memory: "128Mi"
        cpu: "200m"
  - name: jnlp
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
      limits:
        memory: "256Mi"
        cpu: "300m"
'''
    }
  }

  environment {
    APP_NAME = '${appName}'
    SERVICE_NAME = '${serviceName}'
    INGRESS_NAME = '${ingressName}'
    CERT_NAME = '${certName}'
    TLS_SECRET_NAME = '${tlsSecretName}'
    DOMAIN = '${domain}'
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {
    stage('Delete Kubernetes Resources') {
      steps {
        container('kubectl') {
          script {
            echo 'STAGE: Delete Kubernetes Resources'
            echo "Deleting resources for: \${env.APP_NAME}"
            
            sh """
              echo "Deleting deployment..."
              kubectl delete deployment \${APP_NAME} --namespace=default --ignore-not-found=true
              
              echo "Deleting service..."
              kubectl delete service \${SERVICE_NAME} --namespace=default --ignore-not-found=true
              
              echo "Deleting ingress..."
              kubectl delete ingress \${INGRESS_NAME} --namespace=default --ignore-not-found=true
              
              echo "Deleting certificate..."
              kubectl delete certificate \${CERT_NAME} --namespace=default --ignore-not-found=true
              
              echo "Deleting TLS secret..."
              kubectl delete secret \${TLS_SECRET_NAME} --namespace=default --ignore-not-found=true
              
              echo "✅ Kubernetes resource deletion completed"
            """
          }
        }
      }
    }

    stage('Verify Deletion') {
      steps {
        container('kubectl') {
          script {
            echo 'STAGE: Verify Deletion'
            
            sh """
              echo "Verifying resources are deleted..."
              
              kubectl get deployment \${APP_NAME} --namespace=default 2>/dev/null && echo "⚠️ Deployment still exists" || echo "✅ Deployment deleted"
              kubectl get service \${SERVICE_NAME} --namespace=default 2>/dev/null && echo "⚠️ Service still exists" || echo "✅ Service deleted"
              kubectl get ingress \${INGRESS_NAME} --namespace=default 2>/dev/null && echo "⚠️ Ingress still exists" || echo "✅ Ingress deleted"
              kubectl get certificate \${CERT_NAME} --namespace=default 2>/dev/null && echo "⚠️ Certificate still exists" || echo "✅ Certificate deleted"
              kubectl get secret \${TLS_SECRET_NAME} --namespace=default 2>/dev/null && echo "⚠️ TLS Secret still exists" || echo "✅ TLS Secret deleted"
              
              echo "Verification completed"
            """
          }
        }
      }
    }
  }
  
  post {
    success {
      echo "✅ Successfully deleted Kubernetes resources for ${name}"
    }
    
    failure {
      echo "❌ Failed to delete Kubernetes resources for ${name}"
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
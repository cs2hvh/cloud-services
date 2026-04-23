/**
 * Delete Pipeline - Deletes Kubernetes resources for an app
 * Uses lightweight pod template (only kubectl, ~256MB) instead of full common-agent (~4GB)
 * Deletes: Deployment, Service, Ingress, Certificate, and TLS Secret
 */
export function createDeletePipeline(
  name: string,
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
  </description>
  <keepDependencies>false</keepDependencies>

  <properties/>

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
        cpu: "50m"
      limits:
        memory: "256Mi"
        cpu: "200m"
'''
    }
  }

  environment {
    APP_NAME = '${appName}'
    SERVICE_NAME = '${serviceName}'
    INGRESS_NAME = '${ingressName}'
    CERT_NAME = '${certName}'
    TLS_SECRET_NAME = '${tlsSecretName}'
    ENV_SECRET_NAME = '${appName}-env-secret'
    DOMAIN = '${domain}'
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {
    stage('Delete Kubernetes Resources') {
      steps {
        container('kubectl') {
          script {
            echo 'STAGE: Delete Kubernetes Resources'
            echo 'Deleting application resources...'
            
            sh """
              # Delete main resources
              kubectl delete deployment \${APP_NAME} --namespace=default --ignore-not-found=true
              kubectl delete service \${SERVICE_NAME} --namespace=default --ignore-not-found=true
              kubectl delete ingress \${INGRESS_NAME} --namespace=default --ignore-not-found=true
              kubectl delete certificate \${CERT_NAME} --namespace=default --ignore-not-found=true
              kubectl delete secret \${TLS_SECRET_NAME} --namespace=default --ignore-not-found=true
              kubectl delete secret \${ENV_SECRET_NAME} --namespace=default --ignore-not-found=true
              
              # Delete custom domain certificates and secrets (if any)
              echo "Cleaning up custom domain certificates and secrets..."
              kubectl get certificates -n default -o name | grep "^certificate/${name}-custom-" | xargs -r kubectl delete -n default || true
              kubectl get secrets -n default -o name | grep "^secret/${name}-custom-.*-tls" | xargs -r kubectl delete -n default || true
              echo "Custom domain cleanup completed"
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
            echo 'Verifying resources are deleted...'
            
            sh """
              kubectl get deployment \${APP_NAME} --namespace=default 2>/dev/null && echo "[WARN] Deployment still exists" || echo "[PASS] Deployment deleted"
              kubectl get service \${SERVICE_NAME} --namespace=default 2>/dev/null && echo "[WARN] Service still exists" || echo "[PASS] Service deleted"
              kubectl get ingress \${INGRESS_NAME} --namespace=default 2>/dev/null && echo "[WARN] Ingress still exists" || echo "[PASS] Ingress deleted"
              kubectl get certificate \${CERT_NAME} --namespace=default 2>/dev/null && echo "[WARN] Certificate still exists" || echo "[PASS] Certificate deleted"
              kubectl get secret \${TLS_SECRET_NAME} --namespace=default 2>/dev/null && echo "[WARN] TLS Secret still exists" || echo "[PASS] TLS Secret deleted"
              kubectl get secret \${ENV_SECRET_NAME} --namespace=default 2>/dev/null && echo "[WARN] Env Secret still exists" || echo "[PASS] Env Secret deleted"
              
              echo "Verification completed"
            """
          }
        }
      }
    }
  }
  
  post {
    success {
      echo "PIPELINE: Success"
      echo "[PASS] Successfully deleted Kubernetes resources for ${name}"
    }
    
    failure {
      echo "PIPELINE: Failure"
      echo "[FAIL] Failed to delete Kubernetes resources for ${name}"
    }
    always {
      script {
        echo 'PIPELINE: Cleanup'
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

/**
 * Delete Pipeline - Deletes Kubernetes resources for an app
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
  
  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Delete pipeline for ${name}
    Deletes Kubernetes resources: Deployment, Service, Ingress
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
      inheritFrom 'common-agent'
    }
  }

  environment {
    APP_NAME = '${appName}'
    SERVICE_NAME = '${serviceName}'
    INGRESS_NAME = '${ingressName}'
    DOMAIN = '${domain}'
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {
    stage('Initialize') {
      steps {
        script {
          echo 'STAGE: Initialize'
          echo "Application Name: \${env.APP_NAME}"
          echo "Domain: \${env.DOMAIN}"
          echo 'Initialization completed'
        }
      }
    }

    stage('Delete Kubernetes Resources') {
      steps {
        container('kubectl') {
          script {
            echo 'STAGE: Delete Kubernetes Resources'
            echo 'Deleting Kubernetes resources'
            
            echo 'Deleting deployment'
            sh(
              script: 'kubectl delete deployment \${APP_NAME} --namespace=default --ignore-not-found=true',
              returnStatus: true
            )
            
            echo 'Deleting service'
            sh(
              script: 'kubectl delete service \${SERVICE_NAME} --namespace=default --ignore-not-found=true',
              returnStatus: true
            )
            
            echo 'Deleting ingress'
            sh(
              script: 'kubectl delete ingress \${INGRESS_NAME} --namespace=default --ignore-not-found=true',
              returnStatus: true
            )
            
            echo 'Kubernetes resource deletion completed'
          }
        }
      }
    }

    stage('Verify Deletion') {
      steps {
        container('kubectl') {
          script {
            echo 'STAGE: Verify Deletion'
            echo "Checking that resources for \${env.APP_NAME} have been deleted"
            
            echo 'Verifying deployment deletion'
            sh(
              script: 'kubectl get deployment \${APP_NAME} --namespace=default && echo "❌ Deployment still exists" || echo "✅ Deployment deleted"',
              returnStatus: true
            )
            
            echo 'Verifying service deletion'
            sh(
              script: 'kubectl get service \${SERVICE_NAME} --namespace=default && echo "❌ Service still exists" || echo "✅ Service deleted"',
              returnStatus: true
            )
            
            echo 'Verifying ingress deletion'
            sh(
              script: 'kubectl get ingress \${INGRESS_NAME} --namespace=default && echo "❌ Ingress still exists" || echo "✅ Ingress deleted"',
              returnStatus: true
            )
            
            echo 'Deletion verification completed'
          }
        }
      }
    }
  }
  
  post {
    success {
      script {
        echo 'PIPELINE: Success'
        echo "Kubernetes resources deleted successfully for \${env.APP_NAME}"
      }
    }
    
    failure {
      script {
        echo 'PIPELINE: Failure'
        echo "Failed to delete Kubernetes resources for \${env.APP_NAME}"
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
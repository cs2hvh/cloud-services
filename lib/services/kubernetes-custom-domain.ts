/**
 * Kubernetes Custom Domain Service
 * Handles adding/removing custom domains to Ingress resources via Jenkins
 */
import jenkins from "@/lib/jenkins";
import { APP_DOMAIN } from "@/config/domain";

export class KubernetesCustomDomainService {
  /**
   * Add a custom domain to an app's Ingress
   * Creates additional TLS host and rule for the custom domain
   */
  static async addCustomDomainToIngress(appName: string, customDomain: string): Promise<void> {
    const jobName = `${appName}-add-domain-job`;
    
    console.log(`[K8sCustomDomain] Adding custom domain ${customDomain} to app ${appName}`);
    
    const pipeline = this.createAddDomainPipeline(appName, customDomain);
    
    try {
      // Check if job already exists and delete it
      try {
        const jobInfo = await jenkins.job.get(jobName);
        if (jobInfo) {
          await jenkins.job.destroy(jobName);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch {
        // Job doesn't exist, continue
      }

      // Create the job
      await jenkins.job.create(jobName, pipeline);
      console.log(`[K8sCustomDomain] ✅ Created Jenkins job: ${jobName}`);
      
      // Trigger the build
      await new Promise(resolve => setTimeout(resolve, 1000));
      await jenkins.job.build(jobName);
      
      console.log(`[K8sCustomDomain] ✅ Build triggered for adding custom domain`);
      console.log(`[K8sCustomDomain] Monitor at: ${process.env.JENKINS_URL}/job/${jobName}/`);
      
      // Wait for build to complete (with timeout)
      await this.waitForBuildCompletion(jobName, 120000); // 2 minute timeout
      
      // Clean up the job after successful completion
      try {
        await jenkins.job.destroy(jobName);
      } catch {
        // Ignore cleanup errors
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[K8sCustomDomain] Failed to add custom domain:`, errorMessage);
      
      // Cleanup on error
      try {
        await jenkins.job.destroy(jobName);
      } catch {
        // Ignore cleanup errors
      }
      
      throw new Error(`Failed to add custom domain to Ingress: ${errorMessage}`);
    }
  }

  /**
   * Remove a custom domain from an app's Ingress
   */
  static async removeCustomDomainFromIngress(appName: string, customDomain: string): Promise<void> {
    const jobName = `${appName}-remove-domain-job`;
    
    console.log(`[K8sCustomDomain] Removing custom domain ${customDomain} from app ${appName}`);
    
    const pipeline = this.createRemoveDomainPipeline(appName, customDomain);
    
    try {
      // Check if job already exists and delete it
      try {
        const jobInfo = await jenkins.job.get(jobName);
        if (jobInfo) {
          await jenkins.job.destroy(jobName);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch {
        // Job doesn't exist, continue
      }

      // Create the job
      await jenkins.job.create(jobName, pipeline);
      
      // Trigger the build
      await new Promise(resolve => setTimeout(resolve, 1000));
      await jenkins.job.build(jobName);
      
      console.log(`[K8sCustomDomain] ✅ Build triggered for removing custom domain`);
      
      // Wait for build to complete
      await this.waitForBuildCompletion(jobName, 60000); // 1 minute timeout
      
      // Clean up the job
      try {
        await jenkins.job.destroy(jobName);
      } catch {
        // Ignore cleanup errors
      }
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[K8sCustomDomain] Failed to remove custom domain:`, errorMessage);
      
      try {
        await jenkins.job.destroy(jobName);
      } catch {
        // Ignore cleanup errors
      }
      
      throw new Error(`Failed to remove custom domain from Ingress: ${errorMessage}`);
    }
  }

  /**
   * Wait for Jenkins build to complete
   */
  private static async waitForBuildCompletion(jobName: string, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds
    
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      try {
        const buildInfo = await jenkins.build.get(jobName, 'lastBuild');
        
        if (buildInfo && !buildInfo.building) {
          if (buildInfo.result === 'SUCCESS') {
            console.log(`[K8sCustomDomain] ✅ Build completed successfully`);
            return;
          } else if (buildInfo.result === 'FAILURE' || buildInfo.result === 'ABORTED') {
            throw new Error(`Jenkins build failed with result: ${buildInfo.result}`);
          }
        }
      } catch (error: unknown) {
        // Build might not be available yet, continue polling
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('failed') || errorMessage.includes('FAILURE')) {
          throw error;
        }
      }
    }
    
    throw new Error(`Timeout waiting for Jenkins build to complete`);
  }

  /**
   * Create Jenkins pipeline for adding custom domain to Ingress
   * This properly merges with existing TLS/rules to support multiple domains
   */
  private static createAddDomainPipeline(appName: string, customDomain: string): string {
    const serviceName = `${appName}-service`;
    const certSecretName = `${appName}-custom-${customDomain.replace(/\./g, '-')}-tls`;
    const platformDomain = `${appName}.${APP_DOMAIN}`;
    
    return `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>Add custom domain ${customDomain} to ${appName}</description>
  <keepDependencies>false</keepDependencies>
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
    KUBECONFIG = credentials('kubeconfig_file')
    APP_NAME = '${appName}'
    CUSTOM_DOMAIN = '${customDomain}'
    SERVICE_NAME = '${serviceName}'
    CERT_SECRET = '${certSecretName}'
    PLATFORM_DOMAIN = '${platformDomain}'
  }

  stages {
    stage('Add Custom Domain') {
      steps {
        container('kubectl') {
          script {
            echo "Adding custom domain \${CUSTOM_DOMAIN} to app \${APP_NAME}"
            
            // Create certificate for custom domain
            sh '''
              cat > custom-cert.yaml << CERT_EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${appName}-custom-cert-${customDomain.replace(/\./g, '-')}
  namespace: default
spec:
  secretName: \${CERT_SECRET}
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - \${CUSTOM_DOMAIN}
CERT_EOF
              kubectl apply -f custom-cert.yaml
              echo "Certificate request created for \${CUSTOM_DOMAIN}"
            '''
            
            // Patch existing Ingress to add custom domain (preserving existing domains)
            sh '''
              INGRESS_NAME="${appName}-ingress"
              
              # Get existing TLS entries as JSON array
              EXISTING_TLS=$(kubectl get ingress \${INGRESS_NAME} -o jsonpath='{.spec.tls}' 2>/dev/null || echo "[]")
              
              # Get existing rules as JSON array
              EXISTING_RULES=$(kubectl get ingress \${INGRESS_NAME} -o jsonpath='{.spec.rules}' 2>/dev/null || echo "[]")
              
              # Get existing annotations
              EXISTING_ANNOTATIONS=$(kubectl get ingress \${INGRESS_NAME} -o jsonpath='{.metadata.annotations}' 2>/dev/null || echo "{}")
              
              # Check if custom domain already exists in rules
              if echo "\${EXISTING_RULES}" | grep -q "\${CUSTOM_DOMAIN}"; then
                echo "Domain \${CUSTOM_DOMAIN} already exists in Ingress, updating..."
              fi
              
              # Use kubectl patch with JSON patch to ADD the new domain
              # This preserves existing TLS entries and rules
              kubectl patch ingress \${INGRESS_NAME} --type='json' -p="[
                {\"op\": \"add\", \"path\": \"/spec/tls/-\", \"value\": {\"hosts\": [\"\${CUSTOM_DOMAIN}\"], \"secretName\": \"\${CERT_SECRET}\"}},
                {\"op\": \"add\", \"path\": \"/spec/rules/-\", \"value\": {\"host\": \"\${CUSTOM_DOMAIN}\", \"http\": {\"paths\": [{\"path\": \"/\", \"pathType\": \"Prefix\", \"backend\": {\"service\": {\"name\": \"\${SERVICE_NAME}\", \"port\": {\"number\": 80}}}}]}}}
              ]" || {
                # If JSON patch fails (e.g., empty arrays), fall back to merging with existing spec using jq
                echo "JSON patch failed, falling back to merge with existing spec..."
                
                # Get existing spec and merge new domain into it
                kubectl get ingress \${INGRESS_NAME} -o json > existing-ingress.json
                
                # Use jq to add the new TLS entry and rule to existing arrays
                jq --arg domain "\${CUSTOM_DOMAIN}" --arg secret "\${CERT_SECRET}" --arg svc "\${SERVICE_NAME}" '
                  .spec.tls = (.spec.tls // []) + [{"hosts": [\$domain], "secretName": \$secret}] |
                  .spec.rules = (.spec.rules // []) + [{"host": \$domain, "http": {"paths": [{"path": "/", "pathType": "Prefix", "backend": {"service": {"name": \$svc, "port": {"number": 80}}}}]}}]
                ' existing-ingress.json > merged-ingress.json
                
                kubectl apply -f merged-ingress.json
              }
              
              echo "Ingress updated to include custom domain \${CUSTOM_DOMAIN}"
              
              # Verify the change - show all hosts
              echo "Current Ingress hosts:"
              kubectl get ingress \${INGRESS_NAME} -o jsonpath='{.spec.rules[*].host}' | tr ' ' '\\n'
            '''
          }
        }
      }
    }
    
    stage('Verify SSL') {
      steps {
        container('kubectl') {
          script {
            echo "Waiting for SSL certificate to be ready..."
            sh '''
              # Wait up to 60 seconds for certificate to be ready
              for i in $(seq 1 12); do
                READY=$(kubectl get certificate ${appName}-custom-cert-${customDomain.replace(/\./g, '-')} -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
                if [ "$READY" = "True" ]; then
                  echo "✅ SSL certificate is ready!"
                  exit 0
                fi
                echo "Waiting for certificate... (attempt $i/12)"
                sleep 5
              done
              echo "⚠️ Certificate not ready yet, but Ingress is configured. SSL will be available shortly."
            '''
          }
        }
      }
    }
  }
  
  post {
    success {
      echo "✅ Custom domain ${customDomain} successfully added to ${appName}"
    }
    failure {
      echo "❌ Failed to add custom domain ${customDomain} to ${appName}"
    }
  }
}
]]>
    </script>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>`;
  }

  /**
   * Create Jenkins pipeline for removing custom domain from Ingress
   */
  private static createRemoveDomainPipeline(appName: string, customDomain: string): string {
    const serviceName = `${appName}-service`;
    const platformDomain = `${appName}.${APP_DOMAIN}`;
    const certSecretName = `${appName}-custom-${customDomain.replace(/\./g, '-')}-tls`;
    
    return `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>Remove custom domain ${customDomain} from ${appName}</description>
  <keepDependencies>false</keepDependencies>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script>
<![CDATA[
pipeline {
  agent {
    kubernetes {
      inheritFrom 'common-agent'
      podRetention never()
      activeDeadlineSeconds 180
    }
  }

  environment {
    KUBECONFIG = credentials('kubeconfig_file')
    APP_NAME = '${appName}'
    CUSTOM_DOMAIN = '${customDomain}'
    SERVICE_NAME = '${serviceName}'
    PLATFORM_DOMAIN = '${platformDomain}'
    CERT_SECRET = '${certSecretName}'
  }

  stages {
    stage('Remove Custom Domain') {
      steps {
        container('kubectl') {
          script {
            echo "Removing custom domain \${CUSTOM_DOMAIN} from app \${APP_NAME}"
            
            // Remove only the target domain while preserving others (using jq)
            sh '''
              INGRESS_NAME="${appName}-ingress"
              DOMAIN_TO_REMOVE="${customDomain}"
              
              # Get current ingress as JSON
              kubectl get ingress \${INGRESS_NAME} -o json > current-ingress.json
              
              # Use jq to filter out the target domain from TLS and rules
              # Handle null arrays with // [] to prevent "Cannot iterate over null" error
              jq --arg domain "\${DOMAIN_TO_REMOVE}" '
                .spec.tls = [(.spec.tls // [])[] | select(.hosts | index(\$domain) | not)] |
                .spec.rules = [(.spec.rules // [])[] | select(.host != \$domain)]
              ' current-ingress.json > filtered-ingress.json
              
              echo "Patching ingress to remove \${DOMAIN_TO_REMOVE}..."
              kubectl apply -f filtered-ingress.json
              
              echo "Remaining hosts after removal:"
              kubectl get ingress \${INGRESS_NAME} -o jsonpath='{.spec.rules[*].host}' | tr ' ' '\\n'
            '''
            
            // Delete the custom domain certificate and secret
            sh '''
              CERT_NAME="${appName}-custom-cert-${customDomain.replace(/\./g, '-')}"
              kubectl delete certificate \${CERT_NAME} --ignore-not-found=true
              kubectl delete secret \${CERT_SECRET} --ignore-not-found=true
              echo "Cleaned up certificate and secret for custom domain"
            '''
          }
        }
      }
    }
  }
  
  post {
    success {
      echo "✅ Custom domain ${customDomain} successfully removed from ${appName}"
    }
    failure {
      echo "❌ Failed to remove custom domain ${customDomain} from ${appName}"
    }
  }
}
]]>
    </script>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>`;
  }
}

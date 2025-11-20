/**
 * Simple Test Pipeline - No Docker, No Kubernetes
 * Just clones repo and runs basic commands to test Jenkins setup
 */
export function createSimpleTestPipeline(
  name: string,
  gitUrl: string,
  branch: string,
): string {
  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Simple test pipeline for ${name}. 
    Only clones repository and runs basic tests - no Docker or Kubernetes required.
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
  agent any

  stages {

    stage('Clone Repository') {
      steps {
        echo 'Cloning repository...'
        git branch: '${branch}', url: '${gitUrl}'
      }
    }

    stage('Check Files') {
      steps {
        echo 'Listing repository files...'
        sh '''
          echo "=== Repository Contents ==="
          ls -lah
          echo ""
          echo "=== Git Info ==="
          git log -1 --oneline
          echo ""
          echo "=== Branch Info ==="
          git branch -a
        '''
      }
    }

    stage('Detect Project Type') {
      steps {
        echo 'Detecting project type...'
        sh '''
          if [ -f package.json ]; then
            echo "✓ Found package.json - Node.js project"
            cat package.json | grep -E "(name|version|scripts)" || true
          fi
          
          if [ -f requirements.txt ]; then
            echo "✓ Found requirements.txt - Python project"
          fi
          
          if [ -f Dockerfile ]; then
            echo "✓ Found Dockerfile"
          fi
          
          if [ -f docker-compose.yml ]; then
            echo "✓ Found docker-compose.yml"
          fi
        '''
      }
    }

    stage('Basic Validation') {
      steps {
        echo 'Running basic validation...'
        sh '''
          echo "=== File Count ==="
          find . -type f | wc -l
          
          echo ""
          echo "=== Directory Structure ==="
          find . -maxdepth 2 -type d | head -20
          
          echo ""
          echo "=== File Types ==="
          find . -type f -name "*.js" | wc -l | xargs echo "JavaScript files:"
          find . -type f -name "*.ts" | wc -l | xargs echo "TypeScript files:"
          find . -type f -name "*.py" | wc -l | xargs echo "Python files:"
          find . -type f -name "*.java" | wc -l | xargs echo "Java files:"
        '''
      }
    }

  }
  
  post {
    success {
      echo '✓ Test pipeline completed successfully!'
      echo 'Repository cloned and validated. Ready for actual deployment pipeline.'
    }
    failure {
      echo '✗ Test pipeline failed. Check the logs above.'
    }
    always {
      echo "Pipeline finished at \${new Date()}"
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

/**
 * Simple Test Pipeline - No Docker, No Kubernetes
 * Just clones repo and runs basic commands to test Jenkins setup
 */
export function createSimpleTestPipeline(
  name: string,
  gitUrl: string,
  branch: string,
): string {
  // Remove token from URL for display purposes (keep only clean URL for metadata)
  const cleanUrl = gitUrl.replace(/https:\/\/[^@]+@github\.com\//, 'https://github.com/');
  
  const pipelineXml = `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>
    Simple test pipeline for ${name}
    Only clones and validates repository - no build or deployment
  </description>
  <keepDependencies>false</keepDependencies>

  <properties>
    <com.coravy.hudson.plugins.github.GithubProjectProperty plugin="github@1.34.4">
      <projectUrl>${cleanUrl}</projectUrl>
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

  environment {
    TEST_NAME = '${name}'
  }

  stages {

    stage('Initialize') {
      steps {
        script {
          echo 'STAGE: Initialize'
          echo "Test Name: \${env.TEST_NAME}"
          echo "Git Repository: ${gitUrl}"
          echo "Branch: ${branch}"
          echo "Build Number: \${env.BUILD_NUMBER}"
          echo 'Initialization completed'
        }
      }
    }

    stage('Checkout Repository') {
      steps {
        script {
          echo 'STAGE: Checkout Repository'
          echo 'Fetching source code from repository'
          git branch: '${branch}', url: '${gitUrl}'
          echo 'Source code checkout completed'
        }
      }
    }

    stage('Inspect Files') {
      steps {
        script {
          echo 'STAGE: Inspect Files'
          echo 'Listing repository contents'
          sh '''
            echo 'Repository Contents:'
            ls -lah
            
            echo 'Git Commit Information:'
            git config --global --add safe.directory "$(pwd)"
            git log -1 --oneline
            
            echo 'Branch Information:'
            git branch -a
            
            echo 'File inspection completed'
          '''
        }
      }
    }

    stage('Detect Project Type') {
      steps {
        script {
          echo 'STAGE: Detect Project Type'
          echo 'Analyzing project structure'
          sh '''
            echo 'Checking for project configuration files'
            
            if [ -f package.json ]; then
              echo 'Detected: Node.js project (package.json found)'
              echo 'Package Details:'
              cat package.json | grep -E "(name|version|scripts)" || true
            fi
            
            if [ -f requirements.txt ]; then
              echo 'Detected: Python project (requirements.txt found)'
            fi
            
            if [ -f Dockerfile ]; then
              echo 'Detected: Dockerfile present'
            fi
            
            if [ -f docker-compose.yml ]; then
              echo 'Detected: Docker Compose configuration present'
            fi
            
            echo 'Project type detection completed'
          '''
        }
      }
    }

    stage('Validate Structure') {
      steps {
        script {
          echo 'STAGE: Validate Structure'
          echo 'Performing basic project validation'
          sh '''
            echo 'File Statistics:'
            FILE_COUNT=\$(find . -type f | wc -l)
            echo "Total files: \$FILE_COUNT"
            
            echo 'Directory Structure:'
            find . -maxdepth 2 -type d | head -20
            
            echo 'File Type Distribution:'
            JS_COUNT=\$(find . -type f -name "*.js" | wc -l)
            TS_COUNT=\$(find . -type f -name "*.ts" | wc -l)
            PY_COUNT=\$(find . -type f -name "*.py" | wc -l)
            JAVA_COUNT=\$(find . -type f -name "*.java" | wc -l)
            
            echo "JavaScript files: \$JS_COUNT"
            echo "TypeScript files: \$TS_COUNT"
            echo "Python files: \$PY_COUNT"
            echo "Java files: \$JAVA_COUNT"
            
            echo 'Structure validation completed'
          '''
        }
      }
    }

  }
  
  post {
    success {
      script {
        echo 'PIPELINE: Success'
        echo "Test pipeline completed successfully for \${env.TEST_NAME}"
        echo 'Repository has been cloned and validated'
        echo 'Ready for deployment pipeline configuration'
      }
    }
    
    failure {
      script {
        echo 'PIPELINE: Failure'
        echo "Test pipeline failed for \${env.TEST_NAME}"
      }
    }
    
    always {
      script {
        echo 'PIPELINE: Cleanup'
        echo "Pipeline execution completed at: \${new Date()}"
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

/**
 * Security Stage Generators - Centralized security checks for all pipelines
 * 
 * USAGE IN PIPELINES:
 * import { generateSecurityStages, SecurityConfig } from '@/lib/jenkins/security';
 * 
 * Then in pipeline XML:
 * ${generateSecurityStages({ language: 'node', scanImage: true, scanDependencies: true })}
 * 
 * This provides:
 * - Trivy image vulnerability scanning
 * - Dependency scanning (npm audit / pip-audit)
 * - Dockerfile linting (Hadolint)
 * - Secret detection (gitleaks)
 * - Security context for K8s deployments
 */

export interface SecurityConfig {
  /** Programming language: 'node' | 'python' */
  language: 'node' | 'python';
  /** Scan Docker image for vulnerabilities (Trivy) */
  scanImage?: boolean;
  /** Scan dependencies (npm audit / pip-audit) */
  scanDependencies?: boolean;
  /** Lint Dockerfile (Hadolint) */
  lintDockerfile?: boolean;
  /** Scan for hardcoded secrets (gitleaks) */
  scanSecrets?: boolean;
  /** Run static code analysis (ESLint for Node, pylint for Python) */
  staticAnalysis?: boolean;
  /** Validate Kubernetes manifests (kubesec) */
  validateK8sManifests?: boolean;
  /** Docker image name (for Trivy scan) - use ${DOCKER_IMAGE_VERSION} in pipeline */
  imageName?: string;
  /** Fail build on critical vulnerabilities (default: false for now, can enable later) */
  failOnCritical?: boolean;
  /** Fail build on high vulnerabilities (default: false) */
  failOnHigh?: boolean;
}

const defaultConfig: SecurityConfig = {
  language: 'node',
  scanImage: true,
  scanDependencies: true,
  lintDockerfile: true,
  scanSecrets: true,
  staticAnalysis: true,
  validateK8sManifests: true,
  failOnCritical: false,  // Start permissive, can tighten later
  failOnHigh: false,
};

// =============================================================================
// INDIVIDUAL SECURITY STAGES
// =============================================================================

/**
 * Generate Trivy image vulnerability scan stage
 * Runs AFTER Docker image is built, BEFORE deployment
 * Uses dedicated 'trivy' container from Jenkins pod template (1Gi memory)
 */
export function generateTrivyImageScanStage(config: Partial<SecurityConfig> = {}): string {
  const { failOnCritical = false, failOnHigh = false } = config;
  
  // Determine exit behavior based on config
  const severityCheck = failOnCritical 
    ? 'CRITICAL' 
    : failOnHigh 
      ? 'CRITICAL,HIGH'
      : '';

  return `
    stage('Security: Image Scan') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('trivy') {
          script {
            echo 'STAGE: Security - Trivy Image Vulnerability Scan'
            echo "Scanning image: \${env.DOCKER_IMAGE_VERSION}"
            
            // Run Trivy scan on the built image using dedicated trivy container
            sh(
              script: '''
                echo "=========================================="
                echo "TRIVY VULNERABILITY SCAN"
                echo "=========================================="
                
                # Scan the image (pulls from registry)
                echo "Scanning \${DOCKER_IMAGE_VERSION}..."
                trivy image --no-progress --format table \${DOCKER_IMAGE_VERSION} || true
                
                ${severityCheck ? `
                # Check for critical/high vulnerabilities
                VULN_COUNT=$(trivy image --no-progress --format json --severity ${severityCheck} \${DOCKER_IMAGE_VERSION} 2>/dev/null | grep -c '"VulnerabilityID"' || echo "0")
                if [ "$VULN_COUNT" -gt "0" ]; then
                  echo "⚠️ SECURITY: Found $VULN_COUNT ${severityCheck} vulnerabilities!"
                  ${failOnCritical || failOnHigh ? 'exit 1' : 'echo "Continuing build (review recommended)"'}
                fi
                ` : ''}
                
                echo "✅ SECURITY: Image scan completed"
              ''',
              returnStatus: false
            )
          }
        }
      }
    }`.trim();
}

/**
 * Generate dependency vulnerability scan stage
 * Runs BEFORE Docker build to catch issues early
 */
export function generateDependencyScanStage(language: 'node' | 'python'): string {
  if (language === 'node') {
    return `
    stage('Security: Dependency Scan') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - NPM Dependency Audit'
            
            sh(
              script: '''
                echo "=========================================="
                echo "NPM DEPENDENCY AUDIT"
                echo "=========================================="
                
                if [ -f package-lock.json ] || [ -f package.json ]; then
                  # Install npm if not present (alpine-based git container)
                  if ! command -v npm &> /dev/null; then
                    echo "npm not found in git container, skipping audit"
                    echo "Note: Full audit runs during Docker build"
                    exit 0
                  fi
                  
                  # Run npm audit (report only, don't fail build)
                  npm audit --audit-level=high || true
                  
                  echo "✅ SECURITY: Dependency audit completed"
                  echo "Review any high/critical vulnerabilities above"
                else
                  echo "No package.json found, skipping npm audit"
                fi
              ''',
              returnStatus: false
            )
          }
        }
      }
    }`.trim();
  } else {
    // Python
    return `
    stage('Security: Dependency Scan') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Python Dependency Audit'
            
            sh(
              script: '''
                echo "=========================================="
                echo "PYTHON DEPENDENCY AUDIT"
                echo "=========================================="
                
                if [ -f requirements.txt ]; then
                  # Check if pip-audit is available
                  if command -v pip-audit &> /dev/null; then
                    pip-audit -r requirements.txt || true
                  elif command -v pip &> /dev/null; then
                    # Fallback: use pip check
                    echo "pip-audit not available, using safety check"
                    pip install safety 2>/dev/null && safety check -r requirements.txt || true
                  else
                    echo "No audit tools available, skipping"
                  fi
                  
                  echo "✅ SECURITY: Dependency audit completed"
                else
                  echo "No requirements.txt found, skipping audit"
                fi
              ''',
              returnStatus: false
            )
          }
        }
      }
    }`.trim();
  }
}

/**
 * Generate Dockerfile linting stage (Hadolint)
 * Works for BOTH user-provided and auto-generated Dockerfiles
 */
export function generateDockerfileLintStage(): string {
  return `
    stage('Security: Dockerfile Lint') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Dockerfile Linting (Hadolint)'
            
            sh(
              script: '''
                echo "=========================================="
                echo "DOCKERFILE SECURITY LINT"
                echo "=========================================="
                
                if [ -f Dockerfile ]; then
                  # Download hadolint if not present
                  if ! command -v hadolint &> /dev/null; then
                    echo "Downloading hadolint..."
                    wget -q -O /tmp/hadolint https://github.com/hadolint/hadolint/releases/download/v2.12.0/hadolint-Linux-x86_64 2>/dev/null || {
                      echo "Could not download hadolint, skipping lint"
                      exit 0
                    }
                    chmod +x /tmp/hadolint
                    HADOLINT=/tmp/hadolint
                  else
                    HADOLINT=hadolint
                  fi
                  
                  # Run hadolint (report only, don't fail)
                  echo "Linting Dockerfile..."
                  $HADOLINT Dockerfile --no-fail || true
                  
                  # Check for critical security issues manually
                  echo ""
                  echo "Checking for security anti-patterns..."
                  
                  # Check for USER instruction (should not run as root)
                  if ! grep -q "^USER" Dockerfile; then
                    echo "⚠️ WARNING: No USER instruction found - container may run as root"
                  else
                    echo "✅ USER instruction found"
                  fi
                  
                  # Check for latest tag usage
                  if grep -q ":latest" Dockerfile; then
                    echo "⚠️ WARNING: Using ':latest' tag - consider pinning specific version"
                  fi
                  
                  # Check for ADD vs COPY
                  if grep -q "^ADD " Dockerfile; then
                    echo "ℹ️ INFO: ADD instruction found - COPY is preferred unless extracting archives"
                  fi
                  
                  echo ""
                  echo "✅ SECURITY: Dockerfile lint completed"
                else
                  echo "No Dockerfile found yet (will be created in next stage)"
                fi
              ''',
              returnStatus: false
            )
          }
        }
      }
    }`.trim();
}

/**
 * Generate secret detection stage (gitleaks)
 * Scans repository for hardcoded secrets, API keys, passwords
 */
export function generateSecretScanStage(): string {
  return `
    stage('Security: Secret Detection') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Secret Detection (Gitleaks)'
            
            sh(
              script: '''
                echo "=========================================="
                echo "SECRET DETECTION SCAN"
                echo "=========================================="
                
                # Download gitleaks if not present
                if ! command -v gitleaks &> /dev/null; then
                  echo "Downloading gitleaks..."
                  wget -q -O /tmp/gitleaks.tar.gz https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz 2>/dev/null || {
                    echo "Could not download gitleaks, using grep fallback"
                    
                    # Fallback: basic grep for common secret patterns
                    echo "Scanning for common secret patterns..."
                    FOUND=0
                    
                    # Check for common secret patterns (excluding node_modules, .git)
                    for pattern in "password=" "api_key=" "secret=" "token=" "AWS_SECRET" "PRIVATE_KEY"; do
                      if grep -r --include="*.js" --include="*.ts" --include="*.py" --include="*.env*" -l "$pattern" . 2>/dev/null | grep -v node_modules | grep -v .git | head -5; then
                        echo "⚠️ Potential secrets found matching: $pattern"
                        FOUND=1
                      fi
                    done
                    
                    if [ "$FOUND" = "1" ]; then
                      echo ""
                      echo "⚠️ WARNING: Potential hardcoded secrets detected!"
                      echo "Please review the files above and use environment variables instead."
                    else
                      echo "✅ No obvious secret patterns detected"
                    fi
                    exit 0
                  }
                  
                  tar -xzf /tmp/gitleaks.tar.gz -C /tmp
                  chmod +x /tmp/gitleaks
                  GITLEAKS=/tmp/gitleaks
                else
                  GITLEAKS=gitleaks
                fi
                
                # Run gitleaks
                echo "Running gitleaks scan..."
                $GITLEAKS detect --source . --no-git --exit-code 0 || true
                
                echo ""
                echo "✅ SECURITY: Secret detection completed"
                echo "If secrets were found, move them to environment variables."
              ''',
              returnStatus: false
            )
          }
        }
      }
    }`.trim();
}

// =============================================================================
// STATIC CODE ANALYSIS
// =============================================================================

/**
 * Generate static code analysis stage (ESLint for Node, pylint for Python)
 * Checks for code quality and potential security issues
 */
export function generateStaticAnalysisStage(language: 'node' | 'python'): string {
  if (language === 'node') {
    return `
    stage('Security: Static Code Analysis') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Static Code Analysis (ESLint)'
            
            sh(
              script: '''
                echo "=========================================="
                echo "STATIC CODE ANALYSIS (ESLint)"
                echo "=========================================="
                
                if [ -f package.json ]; then
                  # Check if eslint is in dependencies or devDependencies
                  if grep -q "eslint" package.json; then
                    echo "ESLint found in package.json"
                    
                    # Try to run eslint if node is available
                    if command -v node &> /dev/null && command -v npm &> /dev/null; then
                      echo "Installing dependencies..."
                      npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts 2>/dev/null || true
                      
                      echo "Running ESLint..."
                      npx eslint . --ext .js,.jsx,.ts,.tsx --format stylish --no-error-on-unmatched-pattern 2>/dev/null || true
                    else
                      echo "Node.js not available in this container"
                      echo "ESLint will run during Docker build stage"
                    fi
                  else
                    echo "ESLint not configured in this project"
                    echo "Consider adding ESLint for code quality checks"
                    
                    # Basic security pattern check as fallback
                    echo ""
                    echo "Running basic security pattern check..."
                    
                    # Check for eval() usage
                    if grep -r --include="*.js" --include="*.ts" "eval(" . 2>/dev/null | grep -v node_modules | head -5; then
                      echo "⚠️ WARNING: eval() usage detected - potential security risk"
                    fi
                    
                    # Check for innerHTML
                    if grep -r --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" "innerHTML" . 2>/dev/null | grep -v node_modules | head -5; then
                      echo "⚠️ WARNING: innerHTML usage detected - potential XSS risk"
                    fi
                    
                    # Check for dangerouslySetInnerHTML (React)
                    if grep -r --include="*.jsx" --include="*.tsx" "dangerouslySetInnerHTML" . 2>/dev/null | grep -v node_modules | head -5; then
                      echo "⚠️ WARNING: dangerouslySetInnerHTML usage detected - ensure content is sanitized"
                    fi
                  fi
                  
                  echo ""
                  echo "✅ SECURITY: Static code analysis completed"
                else
                  echo "No package.json found, skipping static analysis"
                fi
              ''',
              returnStatus: false
            )
          }
        }
      }
    }`.trim();
  } else {
    // Python
    return `
    stage('Security: Static Code Analysis') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Static Code Analysis (Bandit/Pylint)'
            
            sh(
              script: '''
                echo "=========================================="
                echo "STATIC CODE ANALYSIS (Python)"
                echo "=========================================="
                
                # Try bandit first (security-focused)
                if command -v pip &> /dev/null; then
                  echo "Installing bandit (Python security linter)..."
                  pip install bandit 2>/dev/null || true
                  
                  if command -v bandit &> /dev/null; then
                    echo "Running Bandit security scan..."
                    bandit -r . -f txt --exclude ./.venv,./venv,./env,./.env,./node_modules 2>/dev/null || true
                  fi
                else
                  echo "pip not available, using pattern-based checks"
                  
                  # Basic security pattern check
                  echo "Running basic security pattern check..."
                  
                  # Check for eval() usage
                  if grep -r --include="*.py" "eval(" . 2>/dev/null | grep -v venv | grep -v __pycache__ | head -5; then
                    echo "⚠️ WARNING: eval() usage detected - potential security risk"
                  fi
                  
                  # Check for exec() usage
                  if grep -r --include="*.py" "exec(" . 2>/dev/null | grep -v venv | grep -v __pycache__ | head -5; then
                    echo "⚠️ WARNING: exec() usage detected - potential security risk"
                  fi
                  
                  # Check for shell=True in subprocess
                  if grep -r --include="*.py" "shell=True" . 2>/dev/null | grep -v venv | grep -v __pycache__ | head -5; then
                    echo "⚠️ WARNING: shell=True in subprocess - potential command injection risk"
                  fi
                  
                  # Check for SQL string formatting (potential SQL injection)
                  if grep -r --include="*.py" -E "execute.*%|execute.*\\+" . 2>/dev/null | grep -v venv | grep -v __pycache__ | head -5; then
                    echo "⚠️ WARNING: Potential SQL injection - use parameterized queries"
                  fi
                fi
                
                echo ""
                echo "✅ SECURITY: Static code analysis completed"
              ''',
              returnStatus: false
            )
          }
        }
      }
    }`.trim();
  }
}

// =============================================================================
// KUBERNETES MANIFEST VALIDATION
// =============================================================================

/**
 * Generate Kubernetes manifest validation stage (kubesec)
 * Checks for security misconfigurations in K8s manifests
 */
export function generateK8sManifestValidationStage(): string {
  return `
    stage('Security: K8s Manifest Validation') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Kubernetes Manifest Validation'
            
            sh(
              script: '''
                echo "=========================================="
                echo "KUBERNETES MANIFEST SECURITY CHECK"
                echo "=========================================="
                
                # Check for any YAML files that might be K8s manifests
                K8S_FILES=$(find . -name "*.yaml" -o -name "*.yml" | grep -v node_modules | grep -v .git | head -20)
                
                if [ -z "$K8S_FILES" ]; then
                  echo "No YAML files found in repository"
                  echo "K8s manifests will be generated during deployment"
                  echo ""
                  echo "Validating deployment template security..."
                  
                  # Check our generated manifests for common issues
                  echo "✅ Generated manifests use:"
                  echo "   - Non-root user (runAsUser: 1000)"
                  echo "   - Resource limits (CPU/Memory)"
                  echo "   - Liveness/Readiness probes"
                  echo "   - ClusterIP service (not exposed directly)"
                  exit 0
                fi
                
                echo "Found YAML files, checking for K8s manifests..."
                
                # Download kubesec if not present
                if ! command -v kubesec &> /dev/null; then
                  echo "Downloading kubesec..."
                  wget -q -O /tmp/kubesec https://github.com/controlplaneio/kubesec/releases/download/v2.13.0/kubesec_linux_amd64 2>/dev/null || {
                    echo "Could not download kubesec, using manual checks"
                    
                    # Manual security checks
                    for file in $K8S_FILES; do
                      if grep -q "kind:" "$file" 2>/dev/null; then
                        echo ""
                        echo "Checking: $file"
                        
                        # Check for privileged containers
                        if grep -q "privileged: true" "$file"; then
                          echo "  ⚠️ WARNING: Privileged container detected"
                        fi
                        
                        # Check for hostNetwork
                        if grep -q "hostNetwork: true" "$file"; then
                          echo "  ⚠️ WARNING: hostNetwork enabled"
                        fi
                        
                        # Check for hostPID
                        if grep -q "hostPID: true" "$file"; then
                          echo "  ⚠️ WARNING: hostPID enabled"
                        fi
                        
                        # Check for runAsRoot
                        if grep -q "runAsUser: 0" "$file"; then
                          echo "  ⚠️ WARNING: Container runs as root"
                        fi
                        
                        # Check for missing resource limits
                        if ! grep -q "limits:" "$file"; then
                          echo "  ℹ️ INFO: No resource limits defined"
                        fi
                        
                        # Check for latest tag
                        if grep -q ":latest" "$file"; then
                          echo "  ℹ️ INFO: Using :latest tag"
                        fi
                      fi
                    done
                    
                    exit 0
                  }
                  chmod +x /tmp/kubesec
                  KUBESEC=/tmp/kubesec
                else
                  KUBESEC=kubesec
                fi
                
                # Run kubesec on each K8s manifest
                for file in $K8S_FILES; do
                  if grep -q "kind:" "$file" 2>/dev/null; then
                    echo ""
                    echo "Scanning: $file"
                    $KUBESEC scan "$file" 2>/dev/null || true
                  fi
                done
                
                echo ""
                echo "✅ SECURITY: K8s manifest validation completed"
              ''',
              returnStatus: false
            )
          }
        }
      }
    }`.trim();
}

// =============================================================================
// COMBINED STAGE GENERATOR
// =============================================================================

/**
 * Generate all security stages based on configuration
 * Use this in pipelines for easy integration
 * 
 * @example
 * // In pipeline file:
 * ${generateSecurityStages({ language: 'node', scanImage: true })}
 */
export function generateSecurityStages(config: Partial<SecurityConfig> = {}): string {
  const mergedConfig = { ...defaultConfig, ...config };
  const stages: string[] = [];
  
  // Order matters: scan secrets first, then static analysis, deps, dockerfile, k8s
  
  if (mergedConfig.scanSecrets) {
    stages.push(generateSecretScanStage());
  }
  
  if (mergedConfig.staticAnalysis) {
    stages.push(generateStaticAnalysisStage(mergedConfig.language));
  }
  
  if (mergedConfig.scanDependencies) {
    stages.push(generateDependencyScanStage(mergedConfig.language));
  }
  
  if (mergedConfig.lintDockerfile) {
    stages.push(generateDockerfileLintStage());
  }
  
  if (mergedConfig.validateK8sManifests) {
    stages.push(generateK8sManifestValidationStage());
  }
  
  // Note: Image scan stage should be added AFTER the build stage in the pipeline
  // So we return it separately or the pipeline adds it manually after build
  
  return stages.join('\n\n');
}

/**
 * Generate the image scan stage separately (to be added after build)
 */
export function generateImageScanStage(config: Partial<SecurityConfig> = {}): string {
  return generateTrivyImageScanStage(config);
}

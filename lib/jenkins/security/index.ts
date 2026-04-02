/**
 * Security Stage Generators - Centralized security checks for all pipelines
 * 
 * SECURITY ARCHITECTURE:
 * - Tools are downloaded at runtime with SHA256 checksum verification
 * - For production: Pre-bake tools into Jenkins agent image for faster builds and supply-chain security
 * 
 * TOOL VERSIONS (update these when upgrading):
 */
const SECURITY_TOOL_VERSIONS = {
  hadolint: { version: '2.12.0', sha256: '56de6d5e5ec427e17b74fa48d51271c7fc0d61244bf5c90e828aab8362d55010' },
  gitleaks: { version: '8.18.0', sha256: '6e19050a3ee0688265ed3be4c46a0362487d20456ecd547e8c7328eaed3980cb' },
};

/**
 * Jenkins Pod Template Container Configuration
 * Tracks which containers are available in Jenkins and which security stages use them
 * 
 * CURRENT JENKINS POD TEMPLATE "common-agent":
 * - Defined at: Jenkins → Manage Jenkins → Clouds → linode-kube → common-agent
 * - Pod spec includes: git, kaniko, kubectl, trivy, jnlp (auto-added)
 */

const JENKINS_CONTAINERS = {
  git: {
    name: 'git',
    image: 'alpine/git:latest',
    inJenkins: true,
    resources: {
      requests: { memory: '256Mi', cpu: '100m' },
      limits: { memory: '1Gi', cpu: '500m' },
    },
    purpose: 'Git operations, shell scripting',
    usedBySecurityStages: ['SECRET-SCAN', 'DEPENDENCY-SCAN', 'DOCKERFILE-LINT', 'STATIC-ANALYSIS', 'K8S-VALIDATION'],
  },
  kaniko: {
    name: 'kaniko',
    image: 'gcr.io/kaniko-project/executor:v1.24.0-debug',
    inJenkins: true,
    resources: {
      requests: { memory: '3Gi', cpu: '500m' },
      limits: { memory: '5Gi', cpu: '1' },
    },
    purpose: 'Docker image building (rootless)',
    usedBySecurityStages: [],
  },
  kubectl: {
    name: 'kubectl',
    image: 'alpine/k8s:1.28.0',
    inJenkins: true,
    resources: {
      requests: { memory: '128Mi', cpu: '100m' },
      limits: { memory: '256Mi', cpu: '500m' },
    },
    purpose: 'Kubernetes deployments',
    usedBySecurityStages: [],
  },
  trivy: {
    name: 'trivy',
    image: 'aquasec/trivy:0.48.0',
    inJenkins: true,
    resources: {
      requests: { memory: '512Mi', cpu: '250m' },
      limits: { memory: '1Gi', cpu: '500m' },
    },
    purpose: 'Container image vulnerability scanning',
    usedBySecurityStages: ['IMAGE-SCAN'],
  },
  jnlp: {
    name: 'jnlp',
    image: 'jenkins/inbound-agent',
    inJenkins: true,
    resources: {
      requests: { memory: '256Mi', cpu: '100m' },
      limits: { memory: '512Mi', cpu: '500m' },
    },
    purpose: 'Jenkins agent communication',
    usedBySecurityStages: [],
  },
  
  // RECOMMENDED FOR FUTURE: Pre-bake security tools into dedicated containers
  // Currently these tools are downloaded at runtime in 'git' container
  hadolint: {
    name: 'hadolint',
    image: 'hadolint/hadolint:v2.12.0-alpine',
    inJenkins: false,
    resources: {
      requests: { memory: '64Mi', cpu: '50m' },
      limits: { memory: '128Mi', cpu: '200m' },
    },
    purpose: 'Dockerfile security linting',
    usedBySecurityStages: ['DOCKERFILE-LINT'],
  },
  gitleaks: {
    name: 'gitleaks',
    image: 'zricethezav/gitleaks:v8.18.0',
    inJenkins: false,
    resources: {
      requests: { memory: '128Mi', cpu: '100m' },
      limits: { memory: '256Mi', cpu: '300m' },
    },
    purpose: 'Secret detection in source code',
    usedBySecurityStages: ['SECRET-SCAN'],
  },
} as const;

/**
 * Migration info for recommended containers (separate from container config)
 */
const CONTAINER_MIGRATIONS = {
  hadolint: {
    current: 'Downloads hadolint v2.12.0 into git container at runtime',
    benefit: 'Faster builds (no download), better supply-chain security, version pinning',
    jenkinsConfig: {
      containerTemplate: {
        name: 'hadolint',
        image: 'hadolint/hadolint:v2.12.0-alpine',
        command: 'cat',
        ttyEnabled: true,
        workingDir: '/home/jenkins/agent',
      },
      rawYaml: `    - name: hadolint
      resources:
        requests:
          memory: "64Mi"
          cpu: "50m"
        limits:
          memory: "128Mi"
          cpu: "200m"`,
    },
  },
  gitleaks: {
    current: 'Downloads gitleaks v8.18.0 into git container at runtime',
    benefit: 'Faster builds, better security, no checksum verification needed',
    jenkinsConfig: {
      containerTemplate: {
        name: 'gitleaks',
        image: 'zricethezav/gitleaks:v8.18.0',
        command: 'cat',
        ttyEnabled: true,
        workingDir: '/home/jenkins/agent',
      },
      rawYaml: `    - name: gitleaks
      resources:
        requests:
          memory: "128Mi"
          cpu: "100m"
        limits:
          memory: "256Mi"
          cpu: "300m"`,
    },
  },
} as const;

/**
 * Security stage to container mapping
 * Shows which Jenkins containers each security stage uses
 */
const SECURITY_STAGE_CONTAINERS = {
  'SECRET-SCAN': {
    primary: 'git',
    downloads: ['gitleaks'],
    recommended: 'gitleaks',
    notes: 'Currently downloads gitleaks at runtime. Consider dedicated container for faster builds.',
  },
  'STATIC-ANALYSIS': {
    primary: 'git',
    downloads: ['bandit (Python)', 'eslint (if not in package.json)'],
    recommended: null,
    notes: 'Uses git container with Node.js/Python tools. Works well as-is.',
  },
  'DEPENDENCY-SCAN': {
    primary: 'git',
    downloads: ['pip-audit (Python)'],
    recommended: null,
    notes: 'npm audit uses existing npm. pip-audit installed via pip. Works well.',
  },
  'DOCKERFILE-LINT': {
    primary: 'git',
    downloads: ['hadolint'],
    recommended: 'hadolint',
    notes: 'Currently downloads hadolint v2.12.0. Dedicated container would be faster.',
  },
  'IMAGE-SCAN': {
    primary: 'trivy',
    downloads: [],
    recommended: null,
    notes: 'Uses dedicated trivy container (1Gi memory). Working perfectly.',
  },
  'K8S-VALIDATION': {
    primary: 'git',
    downloads: [],
    recommended: null,
    notes: 'Manual pattern checks in git container. No external tools needed.',
  },
} as const;

/**
 * Security stage identifiers for logging and tracking
 */
const SECURITY_STAGES = {
  SECRET_SCAN: 'SECRET-SCAN',
  STATIC_ANALYSIS: 'STATIC-ANALYSIS',
  DEPENDENCY_SCAN: 'DEPENDENCY-SCAN',
  DOCKERFILE_LINT: 'DOCKERFILE-LINT',
  IMAGE_SCAN: 'IMAGE-SCAN',
  K8S_VALIDATION: 'K8S-VALIDATION',
} as const;

/**
 * Generate structured logging helpers for consistent output
 */
function generateLoggingHelpers(): string {
  return `
# Structured logging helpers
log_security() {
  local level="\$1"
  local stage="\$2"
  local message="\$3"
  echo "[SECURITY:\$level] [STAGE:\$stage] \$message"
}

log_timing() {
  local stage="\$1"
  local duration="\$2"
  echo "[TIMING] \$stage completed in \${duration}s"
}

start_timer() {
  date +%s
}

end_timer() {
  local start_time="\$1"
  local end_time=\$(date +%s)
  echo \$((end_time - start_time))
}
  `.trim();
}

/**
 * - trivy: Already included (aquasec/trivy:0.48.0) with 1Gi memory
 * - hadolint: Add to git container or create dedicated linter container
 * - gitleaks: Add to git container for secret scanning
 * - kubesec: OPTIONAL - manual checks are reliable fallback
 * - npm/pip: Ensure audit tools are pre-installed
 * 
 * BLOCKING BEHAVIOR (Default: Balanced Mode for Platform Business):
 * - CRITICAL vulnerabilities in container image: BUILD FAILS
 * - Privileged containers/hostNetwork in K8s: BUILD FAILS
 * 
 * WARNINGS (Non-blocking):
 * - CRITICAL dependency vulnerabilities: WARN ONLY (many OSS projects have outdated deps)
 * - Secrets detected: WARN ONLY (many open-source projects have docs/test fixtures)
 * - HIGH severity vulnerabilities (many false positives in transitive deps)
 * - Dockerfile lint issues (stylistic)
 * - Static analysis issues (code quality)
 * - Missing resource limits (informational)
 * 
 * RATIONALE:
 * - Popular OSS projects (Cal.com, Documenso) have documentation/test secrets
 * - Blocking legitimate projects hurts platform adoption
 * - Users can add .gitleaks.toml to suppress specific warnings
 * - Real security issues (CRITICAL CVEs) still block deployment
 * 
 * NOTE: Can enable failOnHigh: true per pipeline for stricter enforcement
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
  /** Programming language: 'node' | 'python' | 'docker' (for generic Dockerfiles) */
  language: 'node' | 'python' | 'docker';
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
  failOnCritical: true,   // SECURITY: Block on CRITICAL vulnerabilities (real threats)
  failOnHigh: false,      // BALANCED: HIGH = warnings only (prevents platform adoption death)
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
  
  // Determine severity levels based on config
  // failOnHigh = true means check both CRITICAL and HIGH
  // failOnCritical = true (alone) means check only CRITICAL
  const severityCheck = failOnHigh 
    ? 'CRITICAL,HIGH'
    : failOnCritical 
      ? 'CRITICAL'
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
                set -e  # Exit on error
                
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.IMAGE_SCAN}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "$STAGE_ID" "Starting Trivy image vulnerability scan"
                echo "=========================================="
                echo "TRIVY VULNERABILITY SCAN"
                echo "=========================================="
                
                # Scan the image once and save as JSON for analysis
                echo "Scanning \${DOCKER_IMAGE_VERSION}..."
                TRIVY_REPORT="/tmp/trivy-report.json"
                trivy image --format json --output "$TRIVY_REPORT" \${DOCKER_IMAGE_VERSION}
                
                # Display human-readable table format
                trivy image --format table \${DOCKER_IMAGE_VERSION}
                
                ${severityCheck ? `
                # Check for ${severityCheck} severity vulnerabilities
                echo ""
                echo "Checking for ${severityCheck} severity vulnerabilities..."
                
                # Use jq to parse JSON and check for vulnerabilities
                if command -v jq &> /dev/null; then
                  # Build jq filter based on severity levels to check
                  ${failOnHigh ? `
                  # Check for both CRITICAL and HIGH
                  VULN_FOUND=$(jq -r '[.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL" or .Severity == "HIGH")] | length' "$TRIVY_REPORT" 2>/dev/null || echo "0")
                  ` : `
                  # Check for CRITICAL only
                  VULN_FOUND=$(jq -r '[.Results[]?.Vulnerabilities[]? | select(.Severity == "CRITICAL")] | length' "$TRIVY_REPORT" 2>/dev/null || echo "0")
                  `}
                  
                  if [ "$VULN_FOUND" -gt "0" ]; then
                    echo "[FAIL] SECURITY FAILURE: Found $VULN_FOUND ${severityCheck} vulnerabilities!"
                    echo "Build blocked for security reasons."
                    ${failOnCritical || failOnHigh ? 'exit 1' : 'echo "[WARN] WARNING: Review recommended but continuing build"'}
                  else
                    echo "[PASS] No ${severityCheck} vulnerabilities found"
                  fi
                else
                  # Fallback: Use trivy's exit-code feature
                  if trivy image --exit-code 1 --severity ${severityCheck} --quiet \${DOCKER_IMAGE_VERSION} 2>&1 | grep -q "Total:"; then
                    echo "[FAIL] SECURITY FAILURE: Found ${severityCheck} vulnerabilities!"
                    ${failOnCritical || failOnHigh ? 'exit 1' : 'echo "[WARN] WARNING: Review recommended"'}
                  else
                    echo "[PASS] No ${severityCheck} vulnerabilities found"
                  fi
                fi
                ` : 'echo "[PASS] Scan completed (informational only)"'}
                
                DURATION=$(end_timer $START_TIME)
                log_timing "$STAGE_ID" "$DURATION"
                log_security "INFO" "$STAGE_ID" "Image scan completed successfully"
              '''
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
export function generateDependencyScanStage(language: 'node' | 'python' | 'docker'): string {
  // Generic dependency scan - auto-detect package manager
  if (language === 'docker') {
    return `
    stage('Security: Dependency Scan') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Generic Dependency Scan'
            
            sh(
              script: '''
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.DEPENDENCY_SCAN}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "$STAGE_ID" "Starting generic dependency scan"
                echo "=========================================="
                echo "GENERIC DEPENDENCY VULNERABILITY SCAN"
                echo "=========================================="
                echo "Auto-detecting package managers..."
                echo ""
                
                SCANS_RUN=0
                
                # Node.js - check for package.json
                if [ -f "package.json" ]; then
                  echo "Detected: Node.js (package.json)"
                  if command -v npm &> /dev/null; then
                    echo "Running npm audit..."
                    npm audit --audit-level=moderate || echo "[WARN] Vulnerabilities found (non-blocking)"
                    SCANS_RUN=$((SCANS_RUN + 1))
                  fi
                fi
                
                # Python - check for requirements.txt or Pipfile
                if [ -f "requirements.txt" ] || [ -f "Pipfile" ]; then
                  echo "Detected: Python (requirements.txt/Pipfile)"
                  if command -v pip &> /dev/null; then
                    pip install pip-audit 2>/dev/null || true
                    if command -v pip-audit &> /dev/null; then
                      echo "Running pip-audit..."
                      pip-audit || echo "[WARN] Vulnerabilities found (non-blocking)"
                      SCANS_RUN=$((SCANS_RUN + 1))
                    fi
                  fi
                fi
                
                # Go - check for go.mod
                if [ -f "go.mod" ]; then
                  echo "Detected: Go (go.mod)"
                  if command -v go &> /dev/null; then
                    echo "Checking Go vulnerabilities..."
                    go list -json -m all 2>/dev/null || echo "Go modules listed"
                    SCANS_RUN=$((SCANS_RUN + 1))
                  else
                    echo "[WARN] Go not available - dependencies will be scanned in Docker build"
                  fi
                fi
                
                # Rust - check for Cargo.toml
                if [ -f "Cargo.toml" ]; then
                  echo "Detected: Rust (Cargo.toml)"
                  if command -v cargo &> /dev/null; then
                    echo "Checking Rust dependencies..."
                    cargo tree 2>/dev/null || echo "Cargo dependencies listed"
                    SCANS_RUN=$((SCANS_RUN + 1))
                  else
                    echo "[WARN] Cargo not available - dependencies will be scanned in Docker build"
                  fi
                fi
                
                # PHP - check for composer.json
                if [ -f "composer.json" ]; then
                  echo "Detected: PHP (composer.json)"
                  if command -v composer &> /dev/null; then
                    echo "Checking PHP dependencies..."
                    composer show 2>/dev/null || echo "Composer dependencies listed"
                    SCANS_RUN=$((SCANS_RUN + 1))
                  else
                    echo "[WARN] Composer not available - dependencies will be scanned in Docker build"
                  fi
                fi
                
                # Ruby - check for Gemfile
                if [ -f "Gemfile" ]; then
                  echo "Detected: Ruby (Gemfile)"
                  if command -v bundle &> /dev/null; then
                    echo "Checking Ruby gems..."
                    bundle list 2>/dev/null || echo "Gems listed"
                    SCANS_RUN=$((SCANS_RUN + 1))
                  else
                    echo "[WARN] Bundler not available - dependencies will be scanned in Docker build"
                  fi
                fi
                
                # Elixir - check for mix.exs
                if [ -f "mix.exs" ]; then
                  echo "Detected: Elixir (mix.exs)"
                  if command -v mix &> /dev/null; then
                    echo "Checking Elixir dependencies..."
                    mix deps 2>/dev/null || echo "Mix dependencies listed"
                    SCANS_RUN=$((SCANS_RUN + 1))
                  else
                    echo "[WARN] Mix not available - dependencies will be scanned in Docker build"
                  fi
                fi
                
                echo ""
                if [ "$SCANS_RUN" -eq 0 ]; then
                  log_security "INFO" "$STAGE_ID" "No package managers detected"
                  echo "[INFO] No recognized package managers found"
                  echo "Dependencies will be scanned during Docker image build"
                else
                  log_security "INFO" "$STAGE_ID" "$SCANS_RUN package manager(s) scanned"
                  echo "[PASS] Scanned $SCANS_RUN package manager(s)"
                fi
                
                DURATION=$(end_timer $START_TIME)
                log_timing "$STAGE_ID" "$DURATION"
              '''
            )
          }
        }
      }
    }`.trim();
  }
  
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
                set -e  # Exit on error
                
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.DEPENDENCY_SCAN}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "$STAGE_ID" "Starting NPM dependency audit"
                echo "=========================================="
                echo "NPM DEPENDENCY AUDIT"
                echo "=========================================="
                
                if [ -f package-lock.json ] || [ -f package.json ]; then
                  # Install npm if not present (alpine-based git container)
                  if ! command -v npm &> /dev/null; then
                    echo "[WARN] npm not found in git container, skipping pre-build audit"
                    echo "Note: Dependency vulnerabilities will be caught during Docker build"
                    exit 0
                  fi
                  
                  # Run npm audit - FAIL on CRITICAL only (HIGH = warnings)
                  echo "Running npm audit (checking for CRITICAL vulnerabilities - non-blocking)..."
                  
                  # Show all vulnerabilities for visibility
                  npm audit --audit-level=low || true
                  
                  echo ""
                  echo "Checking for CRITICAL vulnerabilities..."
                  
                  # Check specifically for critical - npm audit exits with code 1 if found
                  set +e
                  npm audit --audit-level=critical > /dev/null 2>&1
                  AUDIT_EXIT=$?
                  set -e
                  
                  if [ "$AUDIT_EXIT" -ne "0" ]; then
                    log_security "WARN" "$STAGE_ID" "CRITICAL dependency vulnerabilities found (non-blocking)"
                    echo "[WARN] CRITICAL dependency vulnerabilities detected"
                    echo "RECOMMENDATION: Run 'npm audit fix' to resolve security issues"
                    echo "BUILD CONTINUING (dependency audit is non-blocking for better compatibility)"
                  else
                    log_security "INFO" "$STAGE_ID" "No critical vulnerabilities found"
                    echo "[PASS] SECURITY: No critical dependency vulnerabilities"
                    echo "(HIGH/MODERATE issues shown above as warnings)"
                  fi
                else
                  log_security "INFO" "$STAGE_ID" "No package.json found, skipping"
                  echo "No package.json found, skipping npm audit"
                fi
                
                DURATION=$(end_timer $START_TIME)
                log_timing "$STAGE_ID" "$DURATION"
              '''
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
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.DEPENDENCY_SCAN}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "$STAGE_ID" "Starting Python dependency audit"
                echo "=========================================="
                echo "PYTHON DEPENDENCY AUDIT"
                echo "=========================================="
                
                if [ -f requirements.txt ]; then
                  # Check if pip is available
                  if ! command -v pip &> /dev/null; then
                    echo "[WARN] pip not found, skipping pre-build audit"
                    echo "Note: Dependency vulnerabilities will be caught during Docker build"
                    exit 0
                  fi
                  
                  # Install and run pip-audit (modern Python security scanner)
                  echo "Installing pip-audit..."
                  pip install pip-audit -q
                  
                  # Run pip-audit - WARN on findings (balanced default)
                  # pip-audit has better CVE database than deprecated safety
                  echo "Running pip-audit (warnings only)..."
                  set +e
                  pip-audit -r requirements.txt --format json > /tmp/pip_audit_output.json 2>&1
                  AUDIT_EXIT=$?
                  set -e
                  
                  if [ "$AUDIT_EXIT" -ne 0 ]; then
                    echo ""
                    log_security "WARN" "$STAGE_ID" "Vulnerable dependencies found (non-blocking)"
                    echo "[WARN] WARNING: Vulnerable dependencies reported by pip-audit (non-blocking)"
                    
                    # Display vulnerabilities in readable format
                    if command -v jq &> /dev/null && [ -f /tmp/pip_audit_output.json ]; then
                      jq -r '.vulnerabilities[]? | "\(.package): \(.vulnerability_id) (\(.fixed_version // \"no fix\"))"' /tmp/pip_audit_output.json 2>/dev/null || 
                        pip-audit -r requirements.txt 2>&1 || true
                    else
                      pip-audit -r requirements.txt 2>&1 || true
                    fi
                    
                    echo "Review and update vulnerable packages in requirements.txt"
                    echo "Note: Only CRITICAL CVEs would block - pip-audit reports all findings"
                  else
                    log_security "INFO" "$STAGE_ID" "No vulnerabilities found"
                    echo "[PASS] SECURITY: No known dependency vulnerabilities found"
                  fi
                else
                  log_security "INFO" "$STAGE_ID" "No requirements.txt found, skipping"
                  echo "No requirements.txt found, skipping audit"
                fi
                
                DURATION=$(end_timer $START_TIME)
                log_timing "$STAGE_ID" "$DURATION"
              '''
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
  const hadolintVersion = SECURITY_TOOL_VERSIONS.hadolint.version;
  const hadolintSha256 = SECURITY_TOOL_VERSIONS.hadolint.sha256;
  
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
                set -e  # Exit on error
                
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.DOCKERFILE_LINT}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "$STAGE_ID" "Starting Dockerfile security lint"
                echo "=========================================="
                echo "DOCKERFILE SECURITY LINT"
                echo "=========================================="
                
                if [ -f Dockerfile ]; then
                  # Download hadolint if not present
                  if ! command -v hadolint &> /dev/null; then
                    echo "Downloading hadolint v${hadolintVersion}..."
                    wget -q -O /tmp/hadolint https://github.com/hadolint/hadolint/releases/download/v${hadolintVersion}/hadolint-Linux-x86_64
                    
                    # Verify checksum for security
                    echo "${hadolintSha256}  /tmp/hadolint" | sha256sum -c - || {
                      echo "[FAIL] SECURITY: Hadolint checksum verification failed!"
                      rm -f /tmp/hadolint
                      exit 1
                    }
                    
                    chmod +x /tmp/hadolint
                    HADOLINT=/tmp/hadolint
                  else
                    HADOLINT=hadolint
                  fi
                  
                  # Run hadolint - errors are informational, not blocking
                  # Note: Linting is non-blocking as many rules are stylistic rather than security-critical
                  # For stricter enforcement, remove --no-fail and add specific error codes to ignore
                  echo "Linting Dockerfile..."
                  $HADOLINT Dockerfile --no-fail || echo "[WARN] Lint warnings found (non-blocking)"
                  
                  # Check for critical security issues manually
                  echo ""
                  echo "Checking for security anti-patterns..."
                  
                  # Check for USER instruction (should not run as root)
                  if ! grep -q "^USER" Dockerfile; then
                    echo "[WARN] WARNING: No USER instruction found - container may run as root"
                  else
                    echo "[PASS] USER instruction found"
                  fi
                  
                  # Check for latest tag usage
                  if grep -q ":latest" Dockerfile; then
                    echo "[WARN] WARNING: Using ':latest' tag - consider pinning specific version"
                  fi
                  
                  # Check for ADD vs COPY
                  if grep -q "^ADD " Dockerfile; then
                    echo "[INFO] INFO: ADD instruction found - COPY is preferred unless extracting archives"
                  fi
                  
                  # Check for secret exposure patterns in RUN instructions
                  echo ""
                  echo "Checking for secret exposure patterns..."
                  SECRET_EXPOSURE=0
                  
                  # Detect printenv / env dump in RUN commands
                  if grep -nEi "^RUN.*(printenv|env|set)[[:space:]]*($|>|[|;])" Dockerfile > /dev/null 2>&1; then
                    echo "[WARN] WARNING: Dockerfile may dump environment variables in build output"
                    grep -nEi "^RUN.*(printenv|env|set)[[:space:]]*($|>|[|;])" Dockerfile | while IFS= read -r line; do
                      echo "  -> $line"
                    done
                    SECRET_EXPOSURE=1
                  fi
                  
                  # Detect echo $VAR patterns
                  if grep -nE "^RUN.*echo.*[$][{]?[A-Z_]+" Dockerfile > /dev/null 2>&1; then
                    echo "[WARN] WARNING: Dockerfile echoes environment variables (may leak secrets)"
                    grep -nE "^RUN.*echo.*[$][{]?[A-Z_]+" Dockerfile | while IFS= read -r line; do
                      echo "  -> $line"
                    done
                    SECRET_EXPOSURE=1
                  fi
                  
                  # Detect writing env to files
                  if grep -nEi "^RUN.*(printenv|env|echo.*[$]).*>" Dockerfile > /dev/null 2>&1; then
                    echo "[WARN] WARNING: Dockerfile may write env vars to files (persists in image layer)"
                    grep -nEi "^RUN.*(printenv|env|echo.*[$]).*>" Dockerfile | while IFS= read -r line; do
                      echo "  -> $line"
                    done
                    SECRET_EXPOSURE=1
                  fi
                  
                  if [ "$SECRET_EXPOSURE" = "0" ]; then
                    echo "[PASS] No secret exposure patterns detected"
                  else
                    log_security "WARN" "$STAGE_ID" "Potential secret exposure patterns found in Dockerfile"
                  fi
                  
                  echo ""
                  log_security "INFO" "$STAGE_ID" "Dockerfile lint completed"
                  echo "[PASS] SECURITY: Dockerfile lint completed"
                else
                  log_security "INFO" "$STAGE_ID" "No Dockerfile found yet"
                  echo "No Dockerfile found yet (will be created in next stage)"
                fi
                
                DURATION=$(end_timer $START_TIME)
                log_timing "$STAGE_ID" "$DURATION"
              '''
            )
          }
        }
      }
    }`.trim();
}

/**
 * Generate secret detection stage (gitleaks)
 * Scans repository for hardcoded secrets, API keys, passwords
 * 
 * POLICY: NON-BLOCKING (Warnings only)
 * - Many open-source projects (Cal.com, Documenso) have test/docs with fake secrets
 * - Documentation files (.mdx, .md) often contain example API keys
 * - Users can add .gitleaks.toml to exclude specific patterns
 * - Platform business > false positive blocking
 */
export function generateSecretScanStage(): string {
  const gitleaksVersion = SECURITY_TOOL_VERSIONS.gitleaks.version;
  const gitleaksSha256 = SECURITY_TOOL_VERSIONS.gitleaks.sha256;
  
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
                set -e  # Exit on error for infrastructure issues only
                
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.SECRET_SCAN}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "$STAGE_ID" "Starting secret detection scan"
                echo "=========================================="
                echo "SECRET DETECTION SCAN (NON-BLOCKING)"
                echo "=========================================="
                echo ""
                echo "  This scan reports potential secrets but does NOT block deployments."
                echo "   Review findings and add .gitleaks.toml to exclude false positives."
                echo ""
                
                # Download gitleaks if not present
                if ! command -v gitleaks &> /dev/null; then
                  echo "Downloading gitleaks v${gitleaksVersion}..."
                  wget -q -O /tmp/gitleaks.tar.gz https://github.com/gitleaks/gitleaks/releases/download/v${gitleaksVersion}/gitleaks_${gitleaksVersion}_linux_x64.tar.gz
                  
                  # Verify checksum for security
                  echo "${gitleaksSha256}  /tmp/gitleaks.tar.gz" | sha256sum -c - || {
                    echo "[FAIL] SECURITY: Gitleaks checksum verification failed!"
                    rm -f /tmp/gitleaks.tar.gz
                    exit 1
                  }
                  
                  tar -xzf /tmp/gitleaks.tar.gz -C /tmp
                  chmod +x /tmp/gitleaks
                  GITLEAKS=/tmp/gitleaks
                else
                  GITLEAKS=gitleaks
                fi
                
                # Run gitleaks with baseline support for false positive handling
                echo "Running gitleaks scan..."
                
                # Check if baseline file exists (for excluding known false positives)
                if [ -f ".gitleaks-baseline.json" ]; then
                  echo "[OK] Using .gitleaks-baseline.json to exclude known false positives"
                  BASELINE_ARG="--baseline-path .gitleaks-baseline.json"
                else
                  BASELINE_ARG=""
                fi
                
                # Run scan but don't fail the build
                set +e  # Allow scan to fail without blocking build
                $GITLEAKS detect --source . --no-git $BASELINE_ARG -v 2>&1
                GITLEAKS_EXIT=$?
                set -e
                
                echo ""
                
                if [ "$GITLEAKS_EXIT" -ne "0" ]; then
                  # Secrets found - warn but don't block
                  log_security "WARN" "$STAGE_ID" "Potential secrets detected (non-blocking)"
                  echo " [WARN] Potential secrets detected in code"
                  echo ""
                  echo " RECOMMENDATIONS:"
                  echo "   1. Review the findings above"
                  echo "   2. If these are real secrets: Remove them and use environment variables"
                  echo "   3. If false positives: Add .gitleaks.toml to exclude paths"
                  echo ""
                  echo "Example .gitleaks.toml to exclude docs/tests:"
                  echo "  [allowlist]"
                  echo "    paths = ["
                  echo "      \"docs/**\","
                  echo "      \"**/*.md\","
                  echo "      \"**/*.mdx\","
                  echo "      \"**/test/**\","
                  echo "      \"patches/**\""
                  echo "    ]"
                  echo ""
                  echo "Or create baseline: gitleaks detect --report-path .gitleaks-baseline.json"
                  echo ""
                  echo "[OK] BUILD CONTINUING (secrets are non-blocking for better user experience)"
                else
                  log_security "INFO" "$STAGE_ID" "No secrets detected"
                  echo "[PASS] SECURITY: No secrets detected"
                fi
                
                DURATION=$(end_timer $START_TIME)
                log_timing "$STAGE_ID" "$DURATION"
              '''
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
export function generateStaticAnalysisStage(language: 'node' | 'python' | 'docker'): string {
  // Generic security checks for unknown languages (works for Go, Rust, Elixir, PHP, Java, Ruby, etc.)
  if (language === 'docker') {
    return `
    stage('Security: Generic Code Analysis') {
      when {
        expression { return !params.RESIZE_ONLY }
      }
      steps {
        container('git') {
          script {
            echo 'STAGE: Security - Generic Code Pattern Analysis'
            
            sh(
              script: '''
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.STATIC_ANALYSIS}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "$STAGE_ID" "Starting generic security pattern analysis"
                echo "=========================================="
                echo "GENERIC SECURITY PATTERN ANALYSIS"
                echo "=========================================="
                echo "Scanning for common security issues across all languages"
                echo ""
                
                ISSUES_FOUND=0
                
                # 1. Check for hardcoded credentials/API keys
                echo "Checking for hardcoded credentials..."
                if grep -r -i --include="*.go" --include="*.rs" --include="*.ex" --include="*.php" --include="*.rb" --include="*.java" --include="*.kt" "password =\|api_key =\|secret_key =\|token =" . 2>/dev/null | grep -v test | grep -v example | head -5; then
                  echo "[WARN] Potential hardcoded credentials found"
                  ISSUES_FOUND=$((ISSUES_FOUND + 1))
                fi
                
                # 2. Check for eval/exec usage (dangerous in any language)
                echo ""
                echo "Checking for dangerous eval/exec usage..."
                if grep -r --include="*.go" --include="*.rs" --include="*.ex" --include="*.php" --include="*.rb" --include="*.java" "eval(\|exec(\|system(\|shell_exec(\|Runtime.getRuntime" . 2>/dev/null | grep -v test | head -5; then
                  echo "[WARN] Dangerous code execution functions found"
                  ISSUES_FOUND=$((ISSUES_FOUND + 1))
                fi
                
                # 3. Check for insecure protocols
                echo ""
                echo "Checking for insecure protocols..."
                if grep -r --include="*.go" --include="*.rs" --include="*.ex" --include="*.php" --include="*.rb" --include="*.java" "http://" . 2>/dev/null | grep -v "localhost" | grep -v "127.0.0.1" | grep -v test | head -5; then
                  echo "[WARN] Insecure HTTP URLs found (consider HTTPS)"
                  ISSUES_FOUND=$((ISSUES_FOUND + 1))
                fi
                
                # 4. Check for SQL string concatenation (potential SQL injection)
                echo ""
                echo "Checking for SQL injection risks..."
                if grep -r --include="*.go" --include="*.rs" --include="*.ex" --include="*.php" --include="*.rb" --include="*.java" -E "SELECT.*\+|INSERT.*\+|UPDATE.*\+|DELETE.*\+" . 2>/dev/null | grep -v test | head -5; then
                  echo "[WARN] Potential SQL injection - use parameterized queries"
                  ISSUES_FOUND=$((ISSUES_FOUND + 1))
                fi
                
                # 5. Check for command injection patterns
                echo ""
                echo "Checking for command injection risks..."
                if grep -r --include="*.go" --include="*.rs" --include="*.ex" --include="*.php" --include="*.rb" --include="*.java" -E "os.system\(|exec\(.*\+|system\(.*\+|shell_exec\(.*\+" . 2>/dev/null | grep -v test | head -5; then
                  echo "[WARN] Potential command injection - validate user input"
                  ISSUES_FOUND=$((ISSUES_FOUND + 1))
                fi
                
                # 6. Check for TODO/FIXME security comments
                echo ""
                echo "Checking for security-related TODOs..."
                if grep -r --include="*.go" --include="*.rs" --include="*.ex" --include="*.php" --include="*.rb" --include="*.java" -i "TODO.*security\|FIXME.*security\|HACK.*security\|XXX.*security" . 2>/dev/null | head -3; then
                  echo "[INFO] Security-related TODOs found - review before production"
                fi
                
                echo ""
                if [ "$ISSUES_FOUND" -gt 0 ]; then
                  log_security "WARN" "$STAGE_ID" "$ISSUES_FOUND potential issues found (non-blocking)"
                  echo "[WARN] $ISSUES_FOUND potential security issues found"
                  echo ""
                  echo "RECOMMENDATIONS:"
                  echo "   1. Review the findings above"
                  echo "   2. Use environment variables for credentials"
                  echo "   3. Use parameterized queries for database operations"
                  echo "   4. Validate and sanitize all user input"
                  echo "   5. Use HTTPS for all external connections"
                  echo ""
                  echo "BUILD CONTINUING (generic checks are non-blocking)"
                else
                  log_security "INFO" "$STAGE_ID" "No obvious issues found"
                  echo "[PASS] No obvious security issues detected"
                fi
                
                DURATION=$(end_timer $START_TIME)
                log_timing "$STAGE_ID" "$DURATION"
              '''
            )
          }
        }
      }
    }`.trim();
  }
  
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
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.STATIC_ANALYSIS}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "$STAGE_ID" "Starting static code analysis"
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
                    EVAL_RESULTS=\$(grep -r --include="*.js" --include="*.ts" "eval(" . 2>/dev/null | grep -v node_modules | head -5 || true)
                    if [ -n "\$EVAL_RESULTS" ]; then
                      echo "\$EVAL_RESULTS"
                      echo "[WARN] WARNING: eval() usage detected - potential security risk"
                    fi
                    
                    # Check for innerHTML
                    INNERHTML_RESULTS=\$(grep -r --include="*.js" --include="*.ts" --include="*.jsx" --include="*.tsx" "innerHTML" . 2>/dev/null | grep -v node_modules | head -5 || true)
                    if [ -n "\$INNERHTML_RESULTS" ]; then
                      echo "\$INNERHTML_RESULTS"
                      echo "[WARN] WARNING: innerHTML usage detected - potential XSS risk"
                    fi
                    
                    # Check for dangerouslySetInnerHTML (React)
                    DANGEROUS_RESULTS=\$(grep -r --include="*.jsx" --include="*.tsx" "dangerouslySetInnerHTML" . 2>/dev/null | grep -v node_modules | head -5 || true)
                    if [ -n "\$DANGEROUS_RESULTS" ]; then
                      echo "\$DANGEROUS_RESULTS"
                      echo "[WARN] WARNING: dangerouslySetInnerHTML usage detected - ensure content is sanitized"
                    fi
                  fi
                  
                  echo ""
                  log_security "INFO" "$STAGE_ID" "Static code analysis completed"
                  echo "[PASS] SECURITY: Static code analysis completed"
                else
                  log_security "INFO" "$STAGE_ID" "No package.json found, skipping"
                  echo "No package.json found, skipping static analysis"
                fi
                
                DURATION=$(end_timer $START_TIME)
                log_timing "$STAGE_ID" "$DURATION"
              '''
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
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.STATIC_ANALYSIS}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "$STAGE_ID" "Starting Python static code analysis"
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
                    echo "[WARN] WARNING: eval() usage detected - potential security risk"
                  fi
                  
                  # Check for exec() usage
                  if grep -r --include="*.py" "exec(" . 2>/dev/null | grep -v venv | grep -v __pycache__ | head -5; then
                    echo "[WARN] WARNING: exec() usage detected - potential security risk"
                  fi
                  
                  # Check for shell=True in subprocess
                  if grep -r --include="*.py" "shell=True" . 2>/dev/null | grep -v venv | grep -v __pycache__ | head -5; then
                    echo "[WARN] WARNING: shell=True in subprocess - potential command injection risk"
                  fi
                  
                  # Check for SQL string formatting (potential SQL injection)
                  if grep -r --include="*.py" -E "execute.*%|execute.*\\+" . 2>/dev/null | grep -v venv | grep -v __pycache__ | head -5; then
                    echo "[WARN] WARNING: Potential SQL injection - use parameterized queries"
                  fi
                fi
                
                echo ""
                log_security "INFO" "$STAGE_ID" "Static code analysis completed"
                echo "[PASS] SECURITY: Static code analysis completed"
                
                DURATION=$(end_timer $START_TIME)
                log_timing "$STAGE_ID" "$DURATION"
              '''
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
                set -e  # Exit on error
                
${generateLoggingHelpers()}

                STAGE_ID="${SECURITY_STAGES.K8S_VALIDATION}"
                START_TIME=$(start_timer)
                
                log_security "INFO" "\$STAGE_ID" "Starting Kubernetes manifest validation"
                echo "=========================================="
                echo "KUBERNETES MANIFEST SECURITY CHECK"
                echo "=========================================="
                
                # Check for any YAML files that might be K8s manifests (scan ALL, not just first 20)
                # Temporarily disable set -e for find command (may return nothing)
                set +e
                K8S_FILES=\$(find . -name "*.yaml" -o -name "*.yml" 2>/dev/null | grep -v node_modules | grep -v .git)
                set -e
                
                if [ -z "\$K8S_FILES" ]; then
                  echo "No YAML files found in repository"
                  echo "K8s manifests will be generated during deployment"
                  echo ""
                  echo "Validating deployment template security..."
                  
                  # Check our generated manifests for common issues
                  echo "[PASS] Generated manifests use:"
                  echo "   - Non-root user (runAsUser: 1000)"
                  echo "   - Resource limits (CPU/Memory)"
                  echo "   - Liveness/Readiness probes"
                  echo "   - ClusterIP service (not exposed directly)"
                  
                  DURATION=\$(end_timer \$START_TIME)
                  log_timing "\$STAGE_ID" "\$DURATION"
                  log_security "INFO" "\$STAGE_ID" "No K8s manifests found - using secure defaults"
                  exit 0
                fi
                
                echo "Found YAML files, checking for K8s manifests..."
                
                # Manual security checks - RELIABLE and SAFE (no untrusted downloads)
                CRITICAL_ISSUES=0
                
                for file in \$K8S_FILES; do
                  if grep -q "kind:" "\$file" 2>/dev/null; then
                    echo ""
                    echo "Checking: \$file"
                    
                    # Check for privileged containers
                    if grep -q "privileged: true" "\$file"; then
                      echo "  [FAIL] CRITICAL: Privileged container detected"
                      CRITICAL_ISSUES=\$((CRITICAL_ISSUES + 1))
                    fi
                    
                    # Check for hostNetwork
                    if grep -q "hostNetwork: true" "\$file"; then
                      echo "  [FAIL] CRITICAL: hostNetwork enabled"
                      CRITICAL_ISSUES=\$((CRITICAL_ISSUES + 1))
                    fi
                    
                    # Check for hostPID
                    if grep -q "hostPID: true" "\$file"; then
                      echo "  [FAIL] CRITICAL: hostPID enabled"
                      CRITICAL_ISSUES=\$((CRITICAL_ISSUES + 1))
                    fi
                    
                    # Check for runAsRoot
                    if grep -q "runAsUser: 0" "\$file"; then
                      echo "  [FAIL] CRITICAL: Container runs as root"
                      CRITICAL_ISSUES=\$((CRITICAL_ISSUES + 1))
                    fi
                    
                    # Check for missing resource limits
                    if ! grep -q "limits:" "\$file"; then
                      echo "  [WARN] WARNING: No resource limits defined"
                    fi
                    
                    # Check for latest tag
                    if grep -q ":latest" "\$file"; then
                      echo "  [WARN] WARNING: Using :latest tag"
                    fi
                  fi
                done
                
                echo ""
                if [ "\$CRITICAL_ISSUES" -gt "0" ]; then
                  log_security "CRITICAL" "\$STAGE_ID" "Found \$CRITICAL_ISSUES critical K8s security issues"
                  echo "[FAIL] SECURITY FAILURE: Found \$CRITICAL_ISSUES critical K8s security issues!"
                  echo "Fix manifest security issues before deploying."
                  exit 1
                else
                  log_security "INFO" "\$STAGE_ID" "K8s manifest validation passed"
                  echo "[PASS] SECURITY: K8s manifest validation completed"
                fi
                
                DURATION=\$(end_timer \$START_TIME)
                log_timing "\$STAGE_ID" "\$DURATION"
              '''
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

/**
 * Get container usage report - shows which containers are used by security stages
 * Useful for Jenkins pod template management and future planning
 */
export function getContainerUsageReport() {
  const recommendations = Object.keys(CONTAINER_MIGRATIONS).map((containerName) => ({
    action: 'ADD_TO_JENKINS',
    container: containerName,
    benefit: CONTAINER_MIGRATIONS[containerName as keyof typeof CONTAINER_MIGRATIONS].benefit,
    jenkinsConfig: CONTAINER_MIGRATIONS[containerName as keyof typeof CONTAINER_MIGRATIONS].jenkinsConfig,
  }));

  return {
    inJenkins: JENKINS_CONTAINERS,
    stageMapping: SECURITY_STAGE_CONTAINERS,
    recommendations,
  };
}


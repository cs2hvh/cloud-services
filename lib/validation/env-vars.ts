/**
 * Environment Variable Validation
 * 
 * Follows Vercel's approach: Variable name IS the contract.
 * No auto-prefixing, no magic - just validation and helpful warnings.
 */

export interface EnvVar {
  key: string;
  value: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Framework-specific prefix rules (mirroring Vercel's behavior)
 */
const FRAMEWORK_RULES = {
  nextjs: {
    publicPrefixes: ['NEXT_PUBLIC_'],
    supportsRuntime: true,
    displayName: 'Next.js',
    description: 'NEXT_PUBLIC_* → public (build-time), others → server-only (runtime)'
  },
  nuxtjs: {
    publicPrefixes: ['NUXT_PUBLIC_', 'PUBLIC_', 'VITE_'],
    supportsRuntime: true,
    displayName: 'Nuxt.js',
    description: 'NUXT_PUBLIC_*, PUBLIC_*, or VITE_* → public (build-time), others → server-only (runtime)'
  },
  sveltekit: {
    publicPrefixes: ['PUBLIC_'],
    supportsRuntime: true,
    displayName: 'SvelteKit',
    description: 'PUBLIC_* → public (build-time), others → server-only (runtime)'
  },
  vue: {
    publicPrefixes: ['VITE_'],
    supportsRuntime: false,
    displayName: 'Vue.js',
    description: 'VITE_* → public (build-time). Client-only framework - no runtime vars supported.'
  },
  vitereact: {
    publicPrefixes: ['VITE_'],
    supportsRuntime: false,
    displayName: 'Vite React',
    description: 'VITE_* → public (build-time). Client-only framework - no runtime vars supported.'
  },
  angular: {
    publicPrefixes: [], // Angular doesn't natively support env vars
    supportsRuntime: false,
    displayName: 'Angular',
    description: 'Angular does not natively support runtime environment variables. Values are baked at build time via environment.ts file replacements.'
  },
  react: {
    publicPrefixes: [],
    supportsRuntime: true,
    displayName: 'React',
    description: 'Current platform React pipeline treats variables as runtime server environment variables.'
  },
  static: {
    publicPrefixes: [],
    supportsRuntime: true,
    displayName: 'Static Site',
    description: 'Current platform static pipeline treats variables as runtime server environment variables.'
  },
  nodejs: {
    publicPrefixes: [], // All vars are runtime
    supportsRuntime: true,
    displayName: 'Node.js',
    description: 'All variables are server-only (runtime). No build-time vars.'
  },
  express: {
    publicPrefixes: [], // All vars are runtime
    supportsRuntime: true,
    displayName: 'Express.js',
    description: 'All variables are server-only (runtime). No build-time vars.'
  },
  python: {
    publicPrefixes: [], // All vars are runtime
    supportsRuntime: true,
    displayName: 'Python',
    description: 'All variables are server-only (runtime). No build-time vars.'
  }
} as const;

// Map hyphenated framework names to internal keys
const FRAMEWORK_KEY_MAP: Record<string, keyof typeof FRAMEWORK_RULES> = {
  'vite-react': 'vitereact',
  'react-vite': 'vitereact',
  next: 'nextjs',
  nuxt: 'nuxtjs',
  vuejs: 'vue',
  expressjs: 'express',

  // Deployment pipeline maps many frameworks to shared runtime pipelines.
  svelte: 'nodejs',
  dockerfile: 'nodejs',
  custom: 'nodejs',
  java: 'nodejs',
  maven: 'nodejs',
  spring: 'nodejs',
  'spring-boot': 'nodejs',
  springboot: 'nodejs',
  'simple-test': 'nodejs',
  test: 'nodejs',

  django: 'python',
  flask: 'python',
  fastapi: 'python',
};

/**
 * Patterns that indicate a variable might contain sensitive data
 */
const SENSITIVE_PATTERNS = [
  /SECRET/i,
  /PASSWORD/i,
  /PRIVATE.*KEY/i,
  /API.*KEY/i,
  /TOKEN/i,
  /CREDENTIALS?/i,
  /DATABASE.*URL/i,
  /DB.*URL/i,
  /MONGO.*URI/i,
  /POSTGRES.*URL/i,
  /MYSQL.*URL/i,
  /REDIS.*URL/i,
];

/**
 * Check if a variable name suggests it contains sensitive data
 */
function isSensitiveVarName(key: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(key));
}

/**
 * Check if key starts with any of the allowed prefixes
 */
function startsWithAnyPrefix(key: string, prefixes: readonly string[]): boolean {
  return prefixes.some(prefix => key.startsWith(prefix));
}

/**
 * Normalize framework name to internal key format
 * Handles: "Next.js" → "nextjs", "Nuxt.js" → "nuxtjs", "Vue.js" → "vue", etc.
 */
function normalizeFrameworkKey(framework: string): keyof typeof FRAMEWORK_RULES {
  // First normalize: lowercase and remove dots/spaces
  const normalized = framework.toLowerCase().replace(/[.\s]/g, '');
  // Then apply custom mappings
  return (FRAMEWORK_KEY_MAP[normalized] || normalized) as keyof typeof FRAMEWORK_RULES;
}

/**
 * Validate environment variables for a specific framework
 */
export function validateEnvVars(
  framework: string,
  envVars: EnvVar[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const frameworkKey = normalizeFrameworkKey(framework);
  const rules = FRAMEWORK_RULES[frameworkKey];

  if (!rules) {
    errors.push(`Unknown framework: ${framework}`);
    return { isValid: false, errors, warnings };
  }

  // For frameworks with prefix requirements
  if (rules.publicPrefixes.length > 0 && !rules.supportsRuntime) {
    // Client-only frameworks with required public prefixes (Vue, Vite-React)
    const nonPrefixedVars = envVars.filter(e => !startsWithAnyPrefix(e.key, rules.publicPrefixes));
    
    if (nonPrefixedVars.length > 0) {
      const prefixList = rules.publicPrefixes.join(' or ');
      warnings.push(
        `⚠️ Variables without ${prefixList} prefix won't be accessible:\n` +
        `   ${nonPrefixedVars.map(e => e.key).join(', ')}\n\n` +
        `   ${rules.displayName} is client-only. Variables must start with ${prefixList} to be accessible.\n` +
        `   For sensitive data, use a backend API instead.`
      );
    }

    // Check for sensitive data with public prefix
    const exposedSecrets = envVars.filter(e => 
      startsWithAnyPrefix(e.key, rules.publicPrefixes) && isSensitiveVarName(e.key)
    );

    if (exposedSecrets.length > 0) {
      const prefixList = rules.publicPrefixes.join(' or ');
      errors.push(
        `🔒 Security Risk: These variables will be PUBLIC in your JavaScript bundle:\n` +
        `   ${exposedSecrets.map(e => e.key).join(', ')}\n\n` +
        `   Never use ${prefixList} prefix for secrets.\n` +
        `   Use a backend API to proxy sensitive operations instead.`
      );
    }
  }

  // For frameworks with runtime support
  if (rules.publicPrefixes.length > 0 && rules.supportsRuntime) {
    // SSR frameworks (Next.js, Nuxt, SvelteKit)
    const publicVars = envVars.filter(e => startsWithAnyPrefix(e.key, rules.publicPrefixes));
    
    // Warn about sensitive data in public vars
    const exposedSecrets = publicVars.filter(e => isSensitiveVarName(e.key));
    
    if (exposedSecrets.length > 0) {
      const prefixList = rules.publicPrefixes.join(' or ');
      errors.push(
        `🔒 Security Risk: These variables will be PUBLIC in your JavaScript bundle:\n` +
        `   ${exposedSecrets.map(e => e.key).join(', ')}\n\n` +
        `   Remove ${prefixList} prefix to keep them server-side only.`
      );
    }
  }

  // For build-time only frameworks without prefix requirements (Angular)
  if (rules.publicPrefixes.length === 0 && !rules.supportsRuntime) {
    const suspiciousVars = envVars.filter(e => isSensitiveVarName(e.key));
    
    if (suspiciousVars.length > 0) {
      errors.push(
        `🔒 Security Risk: ${rules.displayName} bundles ALL variables into public JavaScript:\n` +
        `   ${suspiciousVars.map(e => e.key).join(', ')}\n\n` +
        `   These appear to contain sensitive data and will be visible to anyone.\n` +
        `   Use a backend API to handle sensitive operations instead.`
      );
    }

    if (envVars.length > 0) {
      warnings.push(
        `ℹ️ All ${envVars.length} variable(s) will be bundled into your public JavaScript.\n` +
        `   This is normal for ${rules.displayName}, but ensure no secrets are included.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Get helpful hints for a specific framework
 */
export function getFrameworkEnvHints(framework: string): {
  title: string;
  rules: string[];
  example: { good: string[]; bad: string[] };
} {
  const frameworkKey = normalizeFrameworkKey(framework);
  const rules = FRAMEWORK_RULES[frameworkKey];
  
  if (!rules) {
    return {
      title: 'Unknown Framework',
      rules: [],
      example: { good: [], bad: [] }
    };
  }

  const hints = {
    title: `${rules.displayName} Environment Variables`,
    rules: [rules.description],
    example: { good: [] as string[], bad: [] as string[] }
  };

  if (rules.publicPrefixes.length > 0 && !rules.supportsRuntime) {
    // Client-only frameworks with required public prefixes (Vue, Vite)
    const prefix = rules.publicPrefixes[0];
    hints.example.good = [
      `${prefix}API_URL=https://api.example.com`,
      `${prefix}APP_NAME=My App`
    ];
    const prefixList = rules.publicPrefixes.join(' or ');
    hints.example.bad = [
      `API_KEY=secret123 (won't work - needs ${prefixList} prefix)`,
      `${prefix}DATABASE_URL=... (security risk - will be public!)`
    ];
  } else if (rules.publicPrefixes.length > 0 && rules.supportsRuntime) {
    // SSR (Next, Nuxt, etc)
    const prefix = rules.publicPrefixes[0];
    hints.example.good = [
      `${prefix}API_URL=https://api.example.com (public)`,
      `DATABASE_URL=postgres://... (server-only, secure)`
    ];
    hints.example.bad = [
      `${prefix}API_SECRET=... (security risk - will be public!)`,
      `${prefix}DATABASE_URL=... (security risk - will be public!)`
    ];
  } else if (rules.publicPrefixes.length === 0 && !rules.supportsRuntime) {
    // Build-time only without prefix (Angular)
    hints.example.good = [
      `API_URL=https://api.example.com (will be public)`,
      `APP_VERSION=1.0.0 (will be public)`
    ];
    hints.example.bad = [
      `API_SECRET=secret123 (security risk - will be public!)`,
      `DATABASE_URL=postgres://... (security risk - will be public!)`
    ];
  } else {
    // Runtime only (Node.js)
    hints.example.good = [
      `DATABASE_URL=postgres://... (secure, runtime)`,
      `API_SECRET=secret123 (secure, runtime)`
    ];
    hints.example.bad = [];
  }

  return hints;
}

/**
 * Split environment variables according to framework rules
 * (This is what pipelines use internally)
 */
export function splitEnvVarsByFramework(
  framework: string,
  envVars: EnvVar[]
): {
  buildTimeVars: EnvVar[];
  runtimeVars: EnvVar[];
} {
  const frameworkKey = normalizeFrameworkKey(framework);
  const rules = FRAMEWORK_RULES[frameworkKey];

  if (!rules) {
    return { buildTimeVars: [], runtimeVars: [] };
  }

  if (rules.publicPrefixes.length > 0 && rules.supportsRuntime) {
    // SSR frameworks: split by prefix
    return {
      buildTimeVars: envVars.filter(e => startsWithAnyPrefix(e.key, rules.publicPrefixes)),
      runtimeVars: envVars.filter(e => !startsWithAnyPrefix(e.key, rules.publicPrefixes))
    };
  } else if (rules.publicPrefixes.length > 0 && !rules.supportsRuntime) {
    // Client-only with prefix (Vue, Vite): only prefixed vars work
    return {
      buildTimeVars: envVars.filter(e => startsWithAnyPrefix(e.key, rules.publicPrefixes)),
      runtimeVars: []
    };
  } else if (rules.publicPrefixes.length === 0 && !rules.supportsRuntime) {
    // Build-time only without prefix (Angular): everything is build-time
    return {
      buildTimeVars: envVars,
      runtimeVars: []
    };
  } else {
    // Runtime only (Node.js): everything is runtime
    return {
      buildTimeVars: [],
      runtimeVars: envVars
    };
  }
}

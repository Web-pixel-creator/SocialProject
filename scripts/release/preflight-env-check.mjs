const REQUIRED_API_ENV = [
  {
    key: 'NODE_ENV',
    reason: "must be 'production' or 'staging' during release checks",
  },
  { key: 'DATABASE_URL', reason: 'database connection string is required' },
  { key: 'REDIS_URL', reason: 'redis connection string is required' },
  { key: 'S3_ENDPOINT', reason: 'object storage endpoint is required' },
  { key: 'S3_REGION', reason: 'object storage region is required' },
  { key: 'S3_BUCKET', reason: 'object storage bucket is required' },
  { key: 'S3_ACCESS_KEY_ID', reason: 'storage access key is required' },
  { key: 'S3_SECRET_ACCESS_KEY', reason: 'storage secret is required' },
  { key: 'FRONTEND_URL', reason: 'frontend origin is required for CORS' },
  { key: 'JWT_SECRET', reason: 'jwt signing secret is required' },
  { key: 'CSRF_TOKEN', reason: 'csrf token is required' },
  { key: 'ADMIN_API_TOKEN', reason: 'admin API token is required' },
  { key: 'EMBEDDING_PROVIDER', reason: 'embedding provider mode is required' },
];

const REQUIRED_WEB_ENV = [
  {
    key: 'NEXT_PUBLIC_API_BASE_URL',
    reason: 'public API base URL is required',
  },
  {
    key: 'NEXT_PUBLIC_WS_BASE_URL',
    reason: 'public WebSocket base URL is required',
  },
  {
    key: 'NEXT_PUBLIC_SEARCH_AB_ENABLED',
    reason: 'search AB feature flag must be explicit',
  },
  {
    key: 'NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE',
    reason: 'default search profile must be explicit',
  },
  {
    key: 'NEXT_PUBLIC_SEARCH_AB_WEIGHTS',
    reason: 'search AB weight map must be explicit',
  },
];

const WEAK_VALUE_WARNINGS = {
  ADMIN_API_TOKEN: new Set(['change-me', 'changeme', 'dev-admin-token']),
  CSRF_TOKEN: new Set(['dev-csrf', 'csrf', 'change-me', 'changeme']),
  JWT_SECRET: new Set(['dev-secret', 'secret', 'change-me', 'changeme']),
};

const parseArgs = (args) => {
  const options = {
    json: false,
    strict: false,
  };

  for (const arg of args) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        [
          'Usage: node scripts/release/preflight-env-check.mjs [--json] [--strict]',
          '',
          'Checks required release environment variables for API + Web.',
          '--json   Print machine-readable summary',
          '--strict Fail on warnings in addition to missing required values',
          '',
        ].join('\n'),
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const readEnv = (key) => {
  const value = process.env[key];
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const hasLocalhost = (value) =>
  value.includes('localhost') || value.includes('127.0.0.1');

const collectFindings = () => {
  const missing = [];
  const warnings = [];

  for (const entry of REQUIRED_API_ENV) {
    const value = readEnv(entry.key);
    if (!value) {
      missing.push({
        key: entry.key,
        reason: entry.reason,
        scope: 'api',
      });
    }
  }

  for (const entry of REQUIRED_WEB_ENV) {
    const value = readEnv(entry.key);
    if (!value) {
      missing.push({
        key: entry.key,
        reason: entry.reason,
        scope: 'web',
      });
    }
  }

  const nodeEnv = readEnv('NODE_ENV');
  if (nodeEnv && nodeEnv !== 'production' && nodeEnv !== 'staging') {
    warnings.push({
      key: 'NODE_ENV',
      reason: `expected 'production' or 'staging', got '${nodeEnv}'`,
      scope: 'api',
    });
  }

  const embeddingProvider = readEnv('EMBEDDING_PROVIDER');
  if (
    embeddingProvider &&
    embeddingProvider !== 'hash' &&
    embeddingProvider !== 'jina'
  ) {
    warnings.push({
      key: 'EMBEDDING_PROVIDER',
      reason: `unexpected provider '${embeddingProvider}'`,
      scope: 'api',
    });
  }
  if (embeddingProvider === 'jina' && !readEnv('EMBEDDING_API_KEY')) {
    missing.push({
      key: 'EMBEDDING_API_KEY',
      reason: 'required when EMBEDDING_PROVIDER=jina',
      scope: 'api',
    });
  }

  const adminUxEnabled = readEnv('NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK');
  if (adminUxEnabled === 'true' && !readEnv('ADMIN_API_TOKEN')) {
    warnings.push({
      key: 'ADMIN_API_TOKEN',
      reason:
        'Admin UX link is enabled but web-side ADMIN_API_TOKEN is not set',
      scope: 'web',
    });
  }

  const localUrlKeys = [
    { key: 'FRONTEND_URL', scope: 'api' },
    { key: 'NEXT_PUBLIC_API_BASE_URL', scope: 'web' },
    { key: 'NEXT_PUBLIC_WS_BASE_URL', scope: 'web' },
  ];

  for (const entry of localUrlKeys) {
    const value = readEnv(entry.key);
    if (value && hasLocalhost(value)) {
      warnings.push({
        key: entry.key,
        reason: `contains localhost (${value})`,
        scope: entry.scope,
      });
    }
  }

  for (const [key, weakValues] of Object.entries(WEAK_VALUE_WARNINGS)) {
    const value = readEnv(key);
    if (value && weakValues.has(value.toLowerCase())) {
      const scope = key.startsWith('NEXT_PUBLIC_') ? 'web' : 'api';
      warnings.push({
        key,
        reason: `uses weak placeholder value '${value}'`,
        scope,
      });
    }
  }

  return { missing, warnings };
};

const printTextSummary = ({ missing, options, warnings }) => {
  const failingWarnings = options.strict ? warnings.length : 0;
  const status =
    missing.length === 0 && failingWarnings === 0 ? 'PASS' : 'FAIL';

  process.stdout.write(`Release env preflight: ${status}\n`);
  process.stdout.write(`- Missing required: ${missing.length}\n`);
  process.stdout.write(`- Warnings: ${warnings.length}\n`);
  process.stdout.write(`- Strict mode: ${options.strict ? 'on' : 'off'}\n`);

  if (missing.length > 0) {
    process.stdout.write('\nMissing required values:\n');
    for (const item of missing) {
      process.stdout.write(`- [${item.scope}] ${item.key}: ${item.reason}\n`);
    }
  }

  if (warnings.length > 0) {
    process.stdout.write('\nWarnings:\n');
    for (const item of warnings) {
      process.stdout.write(`- [${item.scope}] ${item.key}: ${item.reason}\n`);
    }
  }
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const { missing, warnings } = collectFindings();
  const shouldFail = missing.length > 0 || (options.strict && warnings.length > 0);

  if (options.json) {
    const payload = {
      checkedAtUtc: new Date().toISOString(),
      label: 'release:preflight:env',
      missing,
      status: shouldFail ? 'fail' : 'pass',
      strict: options.strict,
      warnings,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    printTextSummary({ missing, options, warnings });
  }

  if (shouldFail) {
    process.exit(1);
  }
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

import { URL } from 'node:url';

const USAGE = `Usage: node scripts/release/resolve-release-smoke-env.mjs --effective-api-url <url> --effective-web-url <url> --csrf-token <token>

Options:
  --effective-api-url  Effective API URL used by release smoke staging mode.
  --effective-web-url  Effective WEB URL used by release smoke staging mode.
  --csrf-token         Resolved CSRF token.
  --help               Show help.
`;

const parseArgs = (argv) => {
  const options = {
    effectiveApiUrl: '',
    effectiveWebUrl: '',
    csrfToken: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--effective-api-url') {
      options.effectiveApiUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--effective-web-url') {
      options.effectiveWebUrl = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--csrf-token') {
      options.csrfToken = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (!options.effectiveApiUrl || !options.effectiveWebUrl) {
    throw new Error(
      '--effective-api-url and --effective-web-url are required.\n\n' + USAGE,
    );
  }

  return options;
};

const toEnvValue = (name) => {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return '';
};

const toWsOrigin = (apiUrl) => {
  try {
    const parsed = new URL(apiUrl);
    parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return parsed.origin;
  } catch {
    return '';
  }
};

const toShellLiteral = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;

const main = () => {
  const options = parseArgs(process.argv.slice(2));

  const nodeEnv = firstNonEmpty(toEnvValue('RELEASE_NODE_ENV_VAR'), 'staging');
  const databaseUrl = firstNonEmpty(
    toEnvValue('RELEASE_DATABASE_URL_SECRET'),
    toEnvValue('RELEASE_DATABASE_URL_VAR'),
  );
  const redisUrl = firstNonEmpty(
    toEnvValue('RELEASE_REDIS_URL_SECRET'),
    toEnvValue('RELEASE_REDIS_URL_VAR'),
  );
  const s3Endpoint = firstNonEmpty(
    toEnvValue('RELEASE_S3_ENDPOINT_VAR'),
    toEnvValue('RELEASE_S3_ENDPOINT_SECRET'),
  );
  const s3Region = firstNonEmpty(
    toEnvValue('RELEASE_S3_REGION_VAR'),
    toEnvValue('RELEASE_S3_REGION_SECRET'),
  );
  const s3Bucket = firstNonEmpty(
    toEnvValue('RELEASE_S3_BUCKET_VAR'),
    toEnvValue('RELEASE_S3_BUCKET_SECRET'),
  );
  const s3AccessKeyId = firstNonEmpty(
    toEnvValue('RELEASE_S3_ACCESS_KEY_ID_SECRET'),
    toEnvValue('RELEASE_S3_ACCESS_KEY_ID_VAR'),
  );
  const s3SecretAccessKey = firstNonEmpty(
    toEnvValue('RELEASE_S3_SECRET_ACCESS_KEY_SECRET'),
    toEnvValue('RELEASE_S3_SECRET_ACCESS_KEY_VAR'),
  );
  const frontendUrl = firstNonEmpty(
    toEnvValue('RELEASE_FRONTEND_URL_VAR'),
    options.effectiveWebUrl,
  );
  const jwtSecret = firstNonEmpty(
    toEnvValue('RELEASE_JWT_SECRET_SECRET'),
    toEnvValue('RELEASE_JWT_SECRET_VAR'),
  );
  const adminApiToken = firstNonEmpty(
    toEnvValue('RELEASE_ADMIN_API_TOKEN_SECRET'),
    toEnvValue('RELEASE_ADMIN_API_TOKEN_VAR'),
  );
  const embeddingProvider = firstNonEmpty(
    toEnvValue('RELEASE_EMBEDDING_PROVIDER_VAR'),
    toEnvValue('RELEASE_EMBEDDING_PROVIDER_SECRET'),
  );
  const embeddingApiKey = firstNonEmpty(
    toEnvValue('RELEASE_EMBEDDING_API_KEY_SECRET'),
    toEnvValue('RELEASE_EMBEDDING_API_KEY_VAR'),
  );
  const nextPublicApiBaseUrl = firstNonEmpty(
    toEnvValue('RELEASE_NEXT_PUBLIC_API_BASE_URL_VAR'),
    toEnvValue('RELEASE_NEXT_PUBLIC_API_BASE_URL_SECRET'),
    options.effectiveApiUrl,
  );
  const nextPublicWsBaseUrl = firstNonEmpty(
    toEnvValue('RELEASE_NEXT_PUBLIC_WS_BASE_URL_VAR'),
    toEnvValue('RELEASE_NEXT_PUBLIC_WS_BASE_URL_SECRET'),
    toWsOrigin(options.effectiveApiUrl),
  );
  const nextPublicSearchAbEnabled = firstNonEmpty(
    toEnvValue('RELEASE_NEXT_PUBLIC_SEARCH_AB_ENABLED_VAR'),
    toEnvValue('RELEASE_NEXT_PUBLIC_SEARCH_AB_ENABLED_SECRET'),
  );
  const nextPublicSearchDefaultProfile = firstNonEmpty(
    toEnvValue('RELEASE_NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE_VAR'),
    toEnvValue('RELEASE_NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE_SECRET'),
  );
  const nextPublicSearchAbWeights = firstNonEmpty(
    toEnvValue('RELEASE_NEXT_PUBLIC_SEARCH_AB_WEIGHTS_VAR'),
    toEnvValue('RELEASE_NEXT_PUBLIC_SEARCH_AB_WEIGHTS_SECRET'),
  );
  const nextPublicEnableAdminUxLink = firstNonEmpty(
    toEnvValue('RELEASE_NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK_VAR'),
    toEnvValue('RELEASE_NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK_SECRET'),
  );

  const resolvedEntries = [
    ['NODE_ENV', nodeEnv],
    ['DATABASE_URL', databaseUrl],
    ['REDIS_URL', redisUrl],
    ['S3_ENDPOINT', s3Endpoint],
    ['S3_REGION', s3Region],
    ['S3_BUCKET', s3Bucket],
    ['S3_ACCESS_KEY_ID', s3AccessKeyId],
    ['S3_SECRET_ACCESS_KEY', s3SecretAccessKey],
    ['FRONTEND_URL', frontendUrl],
    ['JWT_SECRET', jwtSecret],
    ['CSRF_TOKEN', options.csrfToken],
    ['ADMIN_API_TOKEN', adminApiToken],
    ['EMBEDDING_PROVIDER', embeddingProvider],
    ['EMBEDDING_API_KEY', embeddingApiKey],
    ['NEXT_PUBLIC_API_BASE_URL', nextPublicApiBaseUrl],
    ['NEXT_PUBLIC_WS_BASE_URL', nextPublicWsBaseUrl],
    ['NEXT_PUBLIC_SEARCH_AB_ENABLED', nextPublicSearchAbEnabled],
    ['NEXT_PUBLIC_SEARCH_DEFAULT_PROFILE', nextPublicSearchDefaultProfile],
    ['NEXT_PUBLIC_SEARCH_AB_WEIGHTS', nextPublicSearchAbWeights],
    ['NEXT_PUBLIC_ENABLE_ADMIN_UX_LINK', nextPublicEnableAdminUxLink],
  ];

  const lines = resolvedEntries.map(
    ([name, value]) => `export ${name}=${toShellLiteral(value)}`,
  );
  process.stdout.write(`${lines.join('\n')}\n`);
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

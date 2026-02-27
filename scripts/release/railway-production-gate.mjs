import { spawnSync } from 'node:child_process';

const REQUIRED_WEB_ENV = [
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_WS_BASE_URL',
];

const REQUIRED_API_ENV = [
  'NODE_ENV',
  'DATABASE_URL',
  'REDIS_URL',
  'FRONTEND_URL',
  'JWT_SECRET',
  'CSRF_TOKEN',
  'ADMIN_API_TOKEN',
];

const WEAK_VALUE_WARNINGS = {
  ADMIN_API_TOKEN: new Set(['change-me', 'changeme', 'dev-admin-token']),
  CSRF_TOKEN: new Set(['dev-csrf', 'csrf', 'change-me', 'changeme']),
  JWT_SECRET: new Set(['dev-secret', 'secret', 'change-me', 'changeme']),
};

const parseArgs = (args) => {
  const options = {
    apiService: process.env.RAILWAY_API_SERVICE || 'api',
    environment: process.env.RAILWAY_ENVIRONMENT_NAME || 'production',
    json: false,
    requireApiService: false,
    skipHealth: false,
    strict: false,
    timeoutMs: 8000,
    webService: process.env.RAILWAY_WEB_SERVICE || 'SocialProject',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--require-api-service') {
      options.requireApiService = true;
      continue;
    }
    if (arg === '--no-require-api-service') {
      options.requireApiService = false;
      continue;
    }
    if (arg === '--skip-health') {
      options.skipHealth = true;
      continue;
    }
    if (arg === '--environment') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('--environment requires a value');
      }
      options.environment = value;
      index += 1;
      continue;
    }
    if (arg === '--web-service') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('--web-service requires a value');
      }
      options.webService = value;
      index += 1;
      continue;
    }
    if (arg === '--api-service') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('--api-service requires a value');
      }
      options.apiService = value;
      index += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      const value = Number.parseInt(args[index + 1] ?? '', 10);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--timeout-ms must be a positive integer');
      }
      options.timeoutMs = value;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        [
          'Usage: node scripts/release/railway-production-gate.mjs [options]',
          '',
          'Checks Railway deployment/service/env/health readiness for release.',
          '',
          'Options:',
          '  --environment <name>        Railway environment name (default: production)',
          '  --web-service <name>        Web service name (default: SocialProject)',
          '  --api-service <name>        API service name (default: api)',
          '  --require-api-service       Fail when API service is missing',
          '  --no-require-api-service    Do not fail when API service is missing (default)',
          '  --skip-health               Skip HTTP health checks',
          '  --timeout-ms <n>            Per-request timeout for health checks (default: 8000)',
          '  --strict                    Fail on warnings',
          '  --json                      Output machine-readable JSON',
          '',
        ].join('\n'),
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

const CLI_CANDIDATES =
  process.platform === 'win32'
    ? [
        { command: 'railway.cmd', prefix: [] },
        { command: 'railway.exe', prefix: [] },
        { command: 'npx.cmd', prefix: ['-y', '@railway/cli'] },
      ]
    : [
        { command: 'railway', prefix: [] },
        { command: 'npx', prefix: ['-y', '@railway/cli'] },
      ];

const isMissingCommandError = (result) => {
  const combined = `${result?.stderr ?? ''}\n${result?.stdout ?? ''}`.toLowerCase();
  return (
    result?.error?.code === 'ENOENT' ||
    result?.error?.code === 'EINVAL' ||
    combined.includes('not recognized as an internal or external command') ||
    combined.includes('command not found')
  );
};

let selectedRailwayCli = null;

const escapeShellArg = (value) => {
  if (/^[a-z0-9_./:=@+-]+$/i.test(value)) {
    return value;
  }
  return `"${value.replace(/"/g, '\\"')}"`;
};

const runProcess = (command, args) => {
  if (process.platform === 'win32') {
    const fullCommand = [command, ...args.map(escapeShellArg)].join(' ');
    return spawnSync(fullCommand, {
      encoding: 'utf8',
      shell: true,
    });
  }

  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  });
};

const resolveRailwayCli = () => {
  if (selectedRailwayCli) {
    return selectedRailwayCli;
  }

  for (const candidate of CLI_CANDIDATES) {
    const probe = runProcess(candidate.command, [...candidate.prefix, '--version']);
    if (probe.status === 0) {
      selectedRailwayCli = candidate;
      return selectedRailwayCli;
    }
    if (!isMissingCommandError(probe)) {
      const stderr = probe.stderr?.trim();
      const stdout = probe.stdout?.trim();
      const details = stderr || stdout || `exit code ${probe.status}`;
      throw new Error(
        `Unable to verify Railway CLI via '${candidate.command}': ${details}`,
      );
    }
  }

  throw new Error(
    "Railway CLI not found. Install it (`npm i -g @railway/cli`) or ensure `npx @railway/cli` is available.",
  );
};

const runRailwayCommand = (args) => {
  const runner = resolveRailwayCli();
  const result = runProcess(runner.command, [...runner.prefix, ...args]);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const details = stderr || stdout || `exit code ${result.status}`;
    throw new Error(`railway ${args.join(' ')} failed: ${details}`);
  }

  return result.stdout;
};

const runRailwayJson = (args) => {
  const raw = runRailwayCommand(args);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON response from railway ${args.join(' ')}`);
  }
};

const normalizeServiceName = (name) => name.trim().toLowerCase();

const hasLocalhost = (value) =>
  value.includes('localhost') || value.includes('127.0.0.1');

const toPublicBaseUrl = (domain) => {
  if (!domain) {
    return '';
  }
  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    return domain;
  }
  return `https://${domain}`;
};

const findEnvironmentNode = (status, targetEnvironment) => {
  const environments = status?.environments?.edges?.map((edge) => edge.node) ?? [];
  return (
    environments.find(
      (node) =>
        node.name === targetEnvironment ||
        node.id === targetEnvironment ||
        normalizeServiceName(node.name) === normalizeServiceName(targetEnvironment),
    ) ?? null
  );
};

const findServiceInstance = (environmentNode, serviceName) => {
  const instances =
    environmentNode?.serviceInstances?.edges?.map((edge) => edge.node) ?? [];
  return (
    instances.find(
      (instance) =>
        instance.serviceName === serviceName ||
        instance.serviceId === serviceName ||
        normalizeServiceName(instance.serviceName) ===
          normalizeServiceName(serviceName),
    ) ?? null
  );
};

const evaluateVariables = ({
  failures,
  requiredKeys,
  scope,
  serviceName,
  variables,
  warnings,
}) => {
  for (const key of requiredKeys) {
    const value = typeof variables[key] === 'string' ? variables[key].trim() : '';
    if (!value) {
      failures.push({
        code: 'MISSING_ENV',
        message: `[${scope}] ${serviceName}: missing required variable ${key}`,
      });
    }
  }

  for (const [key, weakValues] of Object.entries(WEAK_VALUE_WARNINGS)) {
    const value = typeof variables[key] === 'string' ? variables[key].trim() : '';
    if (value && weakValues.has(value.toLowerCase())) {
      warnings.push({
        code: 'WEAK_ENV_VALUE',
        message: `[${scope}] ${serviceName}: weak value for ${key}`,
      });
    }
  }

  const urlKeys = ['FRONTEND_URL', 'NEXT_PUBLIC_API_BASE_URL', 'NEXT_PUBLIC_WS_BASE_URL'];
  for (const key of urlKeys) {
    const value = typeof variables[key] === 'string' ? variables[key].trim() : '';
    if (value && hasLocalhost(value)) {
      warnings.push({
        code: 'LOCALHOST_URL',
        message: `[${scope}] ${serviceName}: ${key} points to localhost (${value})`,
      });
    }
  }
};

const checkHealth = async ({ baseUrl, paths, timeoutMs }) => {
  const results = [];
  for (const path of paths) {
    const url = new URL(path, baseUrl).toString();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      });
      results.push({
        ok: response.ok,
        path,
        status: response.status,
        url,
      });
    } catch (error) {
      results.push({
        error: error instanceof Error ? error.message : String(error),
        ok: false,
        path,
        status: null,
        url,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return results;
};

const evaluateService = async ({
  environment,
  failures,
  healthPaths,
  options,
  required,
  requiredEnv,
  scope,
  serviceName,
  serviceNode,
  warnings,
}) => {
  if (!serviceNode) {
    const message = `[${scope}] service '${serviceName}' not found in environment '${environment}'`;
    if (required) {
      failures.push({
        code: 'SERVICE_MISSING',
        message,
      });
    } else {
      warnings.push({
        code: 'SERVICE_MISSING',
        message,
      });
    }
    return {
      deploymentStatus: null,
      exists: false,
      healthChecks: [],
      name: serviceName,
      publicBaseUrl: null,
      required,
      variablesChecked: false,
    };
  }

  const deploymentStatus = serviceNode.latestDeployment?.status ?? null;
  if (required && deploymentStatus !== 'SUCCESS') {
    failures.push({
      code: 'DEPLOYMENT_NOT_SUCCESS',
      message: `[${scope}] ${serviceName}: latest deployment status is '${deploymentStatus ?? 'unknown'}'`,
    });
  } else if (!required && deploymentStatus !== 'SUCCESS') {
    warnings.push({
      code: 'DEPLOYMENT_NOT_SUCCESS',
      message: `[${scope}] ${serviceName}: latest deployment status is '${deploymentStatus ?? 'unknown'}'`,
    });
  }

  const variables = runRailwayJson([
    'variable',
    'list',
    '--service',
    serviceNode.serviceName,
    '--environment',
    environment,
    '--json',
  ]);

  evaluateVariables({
    failures,
    requiredKeys: requiredEnv,
    scope,
    serviceName: serviceNode.serviceName,
    variables,
    warnings,
  });

  const serviceDomain =
    serviceNode.domains?.serviceDomains?.[0]?.domain ||
    variables.RAILWAY_PUBLIC_DOMAIN ||
    '';
  const publicBaseUrl = toPublicBaseUrl(serviceDomain);

  let healthChecks = [];
  if (!options.skipHealth && publicBaseUrl) {
    healthChecks = await checkHealth({
      baseUrl: publicBaseUrl,
      paths: healthPaths,
      timeoutMs: options.timeoutMs,
    });
    for (const result of healthChecks) {
      if (!result.ok) {
        const message = `[${scope}] ${serviceNode.serviceName}: health check failed ${result.path} (${result.status ?? 'error'})`;
        if (required) {
          failures.push({
            code: 'HEALTHCHECK_FAILED',
            message,
          });
        } else {
          warnings.push({
            code: 'HEALTHCHECK_FAILED',
            message,
          });
        }
      }
    }
  } else if (!options.skipHealth && !publicBaseUrl) {
    const message = `[${scope}] ${serviceNode.serviceName}: no public domain available for health checks`;
    if (required) {
      failures.push({
        code: 'HEALTHCHECK_DOMAIN_MISSING',
        message,
      });
    } else {
      warnings.push({
        code: 'HEALTHCHECK_DOMAIN_MISSING',
        message,
      });
    }
  }

  return {
    deploymentStatus,
    exists: true,
    healthChecks,
    name: serviceNode.serviceName,
    publicBaseUrl: publicBaseUrl || null,
    required,
    variablesChecked: true,
  };
};

const printTextSummary = (summary) => {
  process.stdout.write(`Railway production gate: ${summary.status.toUpperCase()}\n`);
  process.stdout.write(`- Environment: ${summary.environment}\n`);
  process.stdout.write(`- Failures: ${summary.failures.length}\n`);
  process.stdout.write(`- Warnings: ${summary.warnings.length}\n`);
  process.stdout.write(`- Strict mode: ${summary.strict ? 'on' : 'off'}\n`);
  process.stdout.write(`- API service required: ${summary.requireApiService ? 'yes' : 'no'}\n`);

  process.stdout.write('\nServices:\n');
  for (const service of summary.services) {
    process.stdout.write(
      `- ${service.name} [${service.required ? 'required' : 'optional'}] ` +
        `exists=${service.exists ? 'yes' : 'no'} ` +
        `deployment=${service.deploymentStatus ?? 'n/a'} ` +
        `domain=${service.publicBaseUrl ?? 'n/a'}\n`,
    );
    if (service.healthChecks.length > 0) {
      for (const health of service.healthChecks) {
        process.stdout.write(
          `  - health ${health.path}: ${health.ok ? 'ok' : 'fail'} (${health.status ?? health.error ?? 'unknown'})\n`,
        );
      }
    }
  }

  if (summary.failures.length > 0) {
    process.stdout.write('\nFailures:\n');
    for (const failure of summary.failures) {
      process.stdout.write(`- ${failure.code}: ${failure.message}\n`);
    }
  }

  if (summary.warnings.length > 0) {
    process.stdout.write('\nWarnings:\n');
    for (const warning of summary.warnings) {
      process.stdout.write(`- ${warning.code}: ${warning.message}\n`);
    }
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  runRailwayCommand(['--version']);

  const statusJson = runRailwayJson(['status', '--json']);
  const environmentNode = findEnvironmentNode(statusJson, options.environment);

  const failures = [];
  const warnings = [];

  if (!environmentNode) {
    failures.push({
      code: 'ENVIRONMENT_NOT_FOUND',
      message: `Railway environment '${options.environment}' was not found in linked project`,
    });
  }

  const webServiceNode = environmentNode
    ? findServiceInstance(environmentNode, options.webService)
    : null;
  const apiServiceNode = environmentNode
    ? findServiceInstance(environmentNode, options.apiService)
    : null;

  const services = [];
  services.push(
    await evaluateService({
      environment: options.environment,
      failures,
      healthPaths: ['/', '/feed'],
      options,
      required: true,
      requiredEnv: REQUIRED_WEB_ENV,
      scope: 'web',
      serviceName: options.webService,
      serviceNode: webServiceNode,
      warnings,
    }),
  );

  services.push(
    await evaluateService({
      environment: options.environment,
      failures,
      healthPaths: ['/health', '/ready'],
      options,
      required: options.requireApiService,
      requiredEnv: REQUIRED_API_ENV,
      scope: 'api',
      serviceName: options.apiService,
      serviceNode: apiServiceNode,
      warnings,
    }),
  );

  const shouldFail = failures.length > 0 || (options.strict && warnings.length > 0);
  const summary = {
    checkedAtUtc: new Date().toISOString(),
    environment: options.environment,
    failures,
    projectId: statusJson.id ?? null,
    projectName: statusJson.name ?? null,
    requireApiService: options.requireApiService,
    services,
    status: shouldFail ? 'fail' : 'pass',
    strict: options.strict,
    warnings,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    printTextSummary(summary);
  }

  if (shouldFail) {
    process.exit(1);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

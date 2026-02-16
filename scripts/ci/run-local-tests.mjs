import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const DEFAULT_TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/finishit',
  REDIS_URL: 'redis://localhost:6379',
  FRONTEND_URL: 'http://localhost:3000',
  JWT_SECRET: 'test-jwt-secret-123456',
  CSRF_TOKEN: 'test-csrf-token-123456',
  ADMIN_API_TOKEN: 'test-admin-token',
  EMBEDDING_PROVIDER: 'hash',
};

const USAGE = `Usage: node scripts/ci/run-local-tests.mjs [--coverage] [--skip-deps] [--skip-migrate] [--timeout-ms <ms>] [--ports <ports>] [-- <extra-jest-args>]

Options:
  --coverage      Run \`npm run test:coverage\` instead of \`npm run test\`.
  --skip-deps     Skip \`docker compose up -d postgres redis\`.
  --skip-migrate  Skip \`npm --workspace apps/api run migrate:up\`.
  --timeout-ms    Timeout for service wait script. Default: 60000.
  --ports         Ports for service wait script. Default: 5432,6379.
  --help          Show help.

Examples:
  npm run test:local
  npm run test:coverage:local
  npm run test:local -- --runInBand
`;

const parsePositiveInteger = (value, label) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer, received: ${value}`);
  }
  return parsed;
};

const parseArgs = (argv) => {
  const options = {
    coverage: false,
    skipDeps: false,
    skipMigrate: false,
    timeoutMs: 60_000,
    ports: '5432,6379',
    passthrough: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      options.passthrough = argv.slice(index + 1);
      break;
    }
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--coverage') {
      options.coverage = true;
      continue;
    }
    if (arg === '--skip-deps') {
      options.skipDeps = true;
      continue;
    }
    if (arg === '--skip-migrate') {
      options.skipMigrate = true;
      continue;
    }
    if (arg === '--timeout-ms') {
      options.timeoutMs = parsePositiveInteger(
        argv[index + 1] ?? '',
        'timeout-ms',
      );
      index += 1;
      continue;
    }
    if (arg === '--ports') {
      options.ports = argv[index + 1] ?? options.ports;
      index += 1;
      continue;
    }
    options.passthrough = argv.slice(index);
    break;
  }

  return options;
};

const resolveNpmCommand = () =>
  process.platform === 'win32' ? 'npm.cmd' : 'npm';

const resolveNodeCommand = () =>
  process.platform === 'win32' ? 'node.exe' : 'node';

const runCommand = ({ command, args, env }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${String(code)}`));
    });
  });

const withDefaultTestEnv = () => {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(DEFAULT_TEST_ENV)) {
    if (!env[key]) {
      env[key] = value;
    }
  }
  return env;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const npmCommand = resolveNpmCommand();
  const nodeCommand = resolveNodeCommand();
  const testEnv = withDefaultTestEnv();

  if (!options.skipDeps) {
    process.stdout.write('Starting local test dependencies (postgres, redis)...\n');
    try {
      await runCommand({
        command: 'docker',
        args: ['compose', 'up', '-d', 'postgres', 'redis'],
        env: process.env,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to start docker dependencies. Start Docker Desktop (or Docker Engine) and retry, or run with --skip-deps when services are already running.\n${message}`,
      );
    }
  } else {
    process.stdout.write('Skipping docker dependency startup (--skip-deps).\n');
  }

  process.stdout.write(
    `Waiting for services on ports ${options.ports} (timeout ${String(options.timeoutMs)}ms)...\n`,
  );
  await runCommand({
    command: nodeCommand,
    args: [
      'scripts/ci/wait-for-services.mjs',
      '--ports',
      options.ports,
      '--timeout-ms',
      String(options.timeoutMs),
    ],
    env: process.env,
  });

  if (!options.skipMigrate) {
    process.stdout.write('Running API migrations...\n');
    await runCommand({
      command: npmCommand,
      args: ['--workspace', 'apps/api', 'run', 'migrate:up'],
      env: testEnv,
    });
  }

  const testArgs = options.coverage ? ['run', 'test:coverage'] : ['run', 'test'];
  if (options.passthrough.length > 0) {
    testArgs.push('--', ...options.passthrough);
  }
  process.stdout.write(
    `Running ${options.coverage ? 'coverage ' : ''}test suite...\n`,
  );
  await runCommand({
    command: npmCommand,
    args: testArgs,
    env: testEnv,
  });
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

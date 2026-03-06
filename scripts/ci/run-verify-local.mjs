import { spawn } from 'node:child_process';
import net from 'node:net';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const {
  LOCAL_VERIFY_PORTS,
  VERIFY_LOCAL_MODE,
  resolveVerifyLocalApiStep,
} = require('./run-verify-local-core.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const USAGE = `Usage: node scripts/ci/run-verify-local.mjs [--skip-deps | --bootstrap-deps]

Runs local verification in four stages:
1. lint
2. ultracite:check
3. test:web -- --runInBand
4. API tests with either dependency bootstrap or skip-deps mode

Options:
  --skip-deps       Force API verification to use pre-running Postgres/Redis.
  --bootstrap-deps  Force API verification to bootstrap Postgres/Redis via Docker.
  --help            Show help.
`;

const parseArgs = (argv) => {
  let mode = VERIFY_LOCAL_MODE.AUTO;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--skip-deps') {
      mode = VERIFY_LOCAL_MODE.SKIP_DEPS;
      continue;
    }
    if (arg === '--bootstrap-deps') {
      mode = VERIFY_LOCAL_MODE.BOOTSTRAP_DEPS;
      continue;
    }
    throw new Error(`Unknown verify-local option: ${arg}`);
  }

  return { mode };
};

const resolveNpmInvocation = () =>
  process.platform === 'win32'
    ? {
        command: 'cmd.exe',
        baseArgs: ['/d', '/s', '/c', 'npm'],
      }
    : {
        command: 'npm',
        baseArgs: [],
      };

const runCommand = ({ args, command }) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      env: process.env,
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

const checkPortReachable = (port, timeoutMs = 1_000) =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finalize = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalize(true));
    socket.once('timeout', () => finalize(false));
    socket.once('error', () => finalize(false));
    socket.connect(port, '127.0.0.1');
  });

const main = async () => {
  const { mode } = parseArgs(process.argv.slice(2));
  const npmInvocation = resolveNpmInvocation();

  process.stdout.write('Running local verification: lint.\n');
  await runCommand({
    command: npmInvocation.command,
    args: [...npmInvocation.baseArgs, 'run', 'lint'],
  });

  process.stdout.write('Running local verification: ultracite.\n');
  await runCommand({
    command: npmInvocation.command,
    args: [...npmInvocation.baseArgs, 'run', 'ultracite:check'],
  });

  process.stdout.write('Running local verification: web tests.\n');
  await runCommand({
    command: npmInvocation.command,
    args: [...npmInvocation.baseArgs, 'run', 'test:web', '--', '--runInBand'],
  });

  const portReachability = {};
  for (const port of LOCAL_VERIFY_PORTS) {
    portReachability[port] = await checkPortReachable(port);
  }

  const apiStep = resolveVerifyLocalApiStep({
    mode,
    portReachability,
  });
  process.stdout.write(`Running local verification: ${apiStep.reason}\n`);
  await runCommand({
    command: npmInvocation.command,
    args: [...npmInvocation.baseArgs, 'run', apiStep.script, '--', '--runInBand'],
  });
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

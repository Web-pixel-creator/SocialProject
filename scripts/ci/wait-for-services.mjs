import net from 'node:net';

const USAGE = `Usage: node scripts/ci/wait-for-services.mjs --ports <p1,p2,...> [--host <hostname>] [--timeout-ms <number>] [--interval-ms <number>]

Options:
  --ports        Comma-separated list of TCP ports to wait for.
  --host         Hostname or IP to probe. Default: 127.0.0.1
  --timeout-ms   Timeout budget per port in ms. Default: 60000
  --interval-ms  Polling interval in ms. Default: 500
  --help         Show help.
`;

const parsePositiveInteger = (raw, name) => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, received: ${raw}`);
  }
  return parsed;
};

const parsePorts = (raw) => {
  const values = String(raw)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw new Error('--ports must contain at least one port.');
  }
  return values.map((value) => parsePositiveInteger(value, 'port'));
};

const parseArgs = (argv) => {
  const options = {
    host: '127.0.0.1',
    timeoutMs: 60_000,
    intervalMs: 500,
    ports: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === '--ports') {
      options.ports = parsePorts(argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    if (arg === '--host') {
      options.host = argv[index + 1] ?? options.host;
      index += 1;
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
    if (arg === '--interval-ms') {
      options.intervalMs = parsePositiveInteger(
        argv[index + 1] ?? '',
        'interval-ms',
      );
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  if (options.ports.length === 0) {
    throw new Error(`--ports is required.\n\n${USAGE}`);
  }

  return options;
};

const delay = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const canConnect = ({ host, port }) =>
  new Promise((resolve) => {
    const socket = net.connect(port, host);

    const onReady = () => {
      socket.end();
      resolve(true);
    };

    const onError = () => {
      socket.destroy();
      resolve(false);
    };

    socket.once('connect', onReady);
    socket.once('error', onError);
  });

const waitForPort = async ({ host, port, timeoutMs, intervalMs }) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    if (await canConnect({ host, port })) {
      return;
    }
    await delay(intervalMs);
  }
  throw new Error(`timeout waiting for ${host}:${String(port)}`);
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  for (const port of options.ports) {
    await waitForPort({
      host: options.host,
      port,
      timeoutMs: options.timeoutMs,
      intervalMs: options.intervalMs,
    });
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

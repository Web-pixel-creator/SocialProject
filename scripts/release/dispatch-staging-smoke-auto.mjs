import { spawn } from 'node:child_process';
import { githubApiRequestWithTransientRetry } from './github-api-request-with-transient-retry.mjs';
import {
  resolveRepoSlug,
  resolveToken,
} from './github-token-repo-resolution.mjs';

const GITHUB_API_VERSION = '2022-11-28';
const USAGE = `Usage: npm run release:smoke:dispatch:auto -- [--help] [--dry-run] [--prefer-tunnel]

Flags:
  --help           Show this message and exit.
  --dry-run        Resolve and print selected mode without dispatching.
  --prefer-tunnel  Force tunnel-helper mode (same as RELEASE_AUTO_PREFER_TUNNEL=true).
`;

const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const githubRequest = async ({ token, method, url }) =>
  githubApiRequestWithTransientRetry({
    apiVersion: GITHUB_API_VERSION,
    method,
    retryLabel: `[release:smoke:dispatch:auto] ${method} ${url}`,
    token,
    url,
  });

const readRepoReleaseVariables = async ({ token, repoSlug }) => {
  if (!token) {
    return null;
  }

  const url = `https://api.github.com/repos/${repoSlug}/actions/variables?per_page=100`;
  const data = await githubRequest({
    token,
    method: 'GET',
    url,
  });

  const list = Array.isArray(data?.variables) ? data.variables : [];
  const map = new Map(list.map((entry) => [entry.name, entry.value]));

  const apiBaseUrl = (map.get('RELEASE_API_BASE_URL') ?? '').trim();
  const webBaseUrl = (map.get('RELEASE_WEB_BASE_URL') ?? '').trim();
  const csrfToken = (map.get('RELEASE_CSRF_TOKEN') ?? '').trim();

  return {
    apiBaseUrl,
    webBaseUrl,
    csrfToken,
  };
};

const getNpmInvocation = (args) => {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    return {
      command: process.execPath,
      args: [npmExecPath, ...args],
      shell: false,
    };
  }
  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args,
    shell: process.platform === 'win32',
  };
};

const runCommand = ({ args, env }) =>
  new Promise((resolve, reject) => {
    const invocation = getNpmInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
      env: { ...process.env, ...(env ?? {}) },
      stdio: 'inherit',
      shell: invocation.shell,
    });

    child.on('error', (error) => {
      reject(
        new Error(
          `Command failed to start (${invocation.command} ${invocation.args.join(' ')}): ${error.message}`,
        ),
      );
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Command failed (${invocation.command} ${invocation.args.join(' ')}) with exit code ${code ?? 'unknown'}`,
        ),
      );
    });
  });

const parseCliArgs = (argv) => {
  const args = argv.slice(2);
  const options = {
    help: false,
    dryRun: false,
    preferTunnel: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--prefer-tunnel') {
      options.preferTunnel = true;
      continue;
    }
    throw new Error(`Unsupported argument '${arg}'.\n\n${USAGE}`);
  }

  return options;
};

const main = async () => {
  const cli = parseCliArgs(process.argv);
  if (cli.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const token = resolveToken({
    allowMissing: true,
  });
  const repoSlug = resolveRepoSlug();
  const envApiBaseUrl = (process.env.RELEASE_API_BASE_URL ?? '').trim();
  const envWebBaseUrl = (process.env.RELEASE_WEB_BASE_URL ?? '').trim();
  const envCsrfToken = (process.env.RELEASE_CSRF_TOKEN ?? '').trim();
  const preferTunnel =
    cli.preferTunnel ||
    (process.env.RELEASE_AUTO_PREFER_TUNNEL ?? 'false').trim().toLowerCase() ===
      'true';

  let selected = {
    mode: 'tunnel-helper',
    apiBaseUrl: '',
    webBaseUrl: '',
    csrfToken: '',
  };

  if (!preferTunnel) {
    if (envApiBaseUrl && envWebBaseUrl) {
      selected = {
        mode: 'env-url-input',
        apiBaseUrl: envApiBaseUrl,
        webBaseUrl: envWebBaseUrl,
        csrfToken: envCsrfToken,
      };
    } else {
      const repoInputs = await readRepoReleaseVariables({ token, repoSlug });
      if (repoInputs && repoInputs.apiBaseUrl && repoInputs.webBaseUrl) {
        selected = {
          mode: 'repo-url-input',
          ...repoInputs,
        };
      }
    }
  }

  process.stdout.write(`Repository: ${repoSlug}\n`);
  process.stdout.write(`Mode: ${selected.mode}\n`);
  process.stdout.write(`Token configured: ${token.length > 0 ? 'yes' : 'no'}\n`);

  if (cli.dryRun || (process.env.RELEASE_AUTO_DRY_RUN ?? '').trim() === 'true') {
    if (selected.mode === 'tunnel-helper') {
      process.stdout.write(
        'Dry-run selected tunnel-helper mode (release:smoke:dispatch:tunnel).\n',
      );
      return;
    }

    process.stdout.write(
      `Dry-run selected URL-input mode with api='${selected.apiBaseUrl}' web='${selected.webBaseUrl}' csrf=${selected.csrfToken ? 'configured' : 'not-configured'}.\n`,
    );
    return;
  }

  if (selected.mode === 'tunnel-helper') {
    await runCommand({
      args: ['run', 'release:smoke:dispatch:tunnel'],
      env: token ? { GITHUB_TOKEN: token } : undefined,
    });
    return;
  }

  await runCommand({
    args: ['run', 'release:smoke:dispatch'],
    env: {
      ...(token ? { GITHUB_TOKEN: token } : {}),
      RELEASE_API_BASE_URL: selected.apiBaseUrl,
      RELEASE_WEB_BASE_URL: selected.webBaseUrl,
      ...(selected.csrfToken ? { RELEASE_CSRF_TOKEN: selected.csrfToken } : {}),
    },
  });
};

main().catch((error) => {
  process.stderr.write(`${toErrorMessage(error)}\n`);
  process.exit(1);
});

import { spawnSync } from 'node:child_process';

const parseCommand = () => {
  const command = process.argv[2];
  if (command !== 'build' && command !== 'start') {
    throw new Error(
      "Usage: node scripts/release/railway-service-runtime.mjs <build|start>",
    );
  }
  return command;
};

const normalize = (value) => value.trim().toLowerCase();

const resolveRole = () => {
  const explicitRole =
    process.env.RAILWAY_SERVICE_ROLE ?? process.env.FINISHIT_RUNTIME_ROLE ?? '';
  if (explicitRole.trim()) {
    return normalize(explicitRole);
  }

  const serviceName = process.env.RAILWAY_SERVICE_NAME ?? '';
  if (serviceName.trim()) {
    const normalizedServiceName = normalize(serviceName);
    if (normalizedServiceName.includes('api')) {
      return 'api';
    }
    if (normalizedServiceName.includes('web')) {
      return 'web';
    }
    if (normalizedServiceName.includes('socialproject')) {
      return 'web';
    }
  }

  return 'web';
};

const resolveWorkspaceAndScript = (role, command) => {
  if (role === 'api') {
    return {
      script: command,
      workspace: 'apps/api',
    };
  }

  if (role === 'web') {
    return {
      script: command,
      workspace: 'apps/web',
    };
  }

  throw new Error(
    `Unsupported service role '${role}'. Expected 'web' or 'api'.`,
  );
};

const run = () => {
  const command = parseCommand();
  const role = resolveRole();
  const target = resolveWorkspaceAndScript(role, command);

  process.stdout.write(
    `[railway-runtime] role=${role} workspace=${target.workspace} command=${target.script}\n`,
  );

  const child =
    process.platform === 'win32'
      ? spawnSync(
          `npm --workspace ${target.workspace} run ${target.script}`,
          {
            shell: true,
            stdio: 'inherit',
          },
        )
      : spawnSync('npm', ['--workspace', target.workspace, 'run', target.script], {
          stdio: 'inherit',
        });

  if (child.error) {
    throw child.error;
  }

  if (typeof child.status === 'number') {
    process.exit(child.status);
  }

  process.exit(1);
};

try {
  run();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

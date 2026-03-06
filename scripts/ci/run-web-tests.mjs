import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const require = createRequire(import.meta.url);
const jestBin = path.join(projectRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const { resolveWebJestArgs } = require('./run-web-tests-core.js');

const DEFAULT_TEST_ENV = {
  NODE_ENV: 'test',
  ADMIN_API_TOKEN: 'test-admin-token',
};

const passthroughArgs = process.argv.slice(2);
const jestArgs = resolveWebJestArgs(passthroughArgs);

const env = { ...process.env };
for (const [key, value] of Object.entries(DEFAULT_TEST_ENV)) {
  if (!env[key]) {
    env[key] = value;
  }
}

const child = spawn(process.execPath, [jestBin, ...jestArgs], {
  cwd: projectRoot,
  stdio: 'inherit',
  env,
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  process.stderr.write(
    `Failed to start Jest web runner: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

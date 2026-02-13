import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const TARGET_FILE = 'apps/web/next-env.d.ts';
const DEV_ROUTES_IMPORT = 'import "./.next/dev/types/routes.d.ts";';
const STABLE_ROUTES_IMPORT = 'import "./.next/types/routes.d.ts";';

const isStagedMode = process.argv.includes('--staged');

const readWorkingTreeFile = () => {
  if (!existsSync(TARGET_FILE)) {
    return null;
  }
  return readFileSync(TARGET_FILE, 'utf8');
};

const readStagedFile = () => {
  try {
    return execFileSync('git', ['show', `:${TARGET_FILE}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }
};

const content = isStagedMode ? readStagedFile() : readWorkingTreeFile();
if (content === null) {
  process.exit(0);
}

const hasDevImport = content.includes(DEV_ROUTES_IMPORT);
if (!hasDevImport) {
  process.exit(0);
}

const sourceLabel = isStagedMode ? 'staged' : 'working tree';

process.stderr.write(
  [
    `Invalid ${TARGET_FILE} in ${sourceLabel}:`,
    `- found ${DEV_ROUTES_IMPORT}`,
    `- expected ${STABLE_ROUTES_IMPORT}`,
    '',
    'Fix:',
    `  git restore ${TARGET_FILE}`,
    `  git add ${TARGET_FILE}`,
  ].join('\n'),
);
process.stderr.write('\n');
process.exit(1);

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runner } from 'node-pg-migrate';

type RawConfig = {
  url?: string;
  schema?: string | string[];
  verbose?: boolean;
  decamelize?: boolean;
  'migrations-dir'?: string;
  'migrations-table'?: string;
  'migrations-schema'?: string;
  'create-schema'?: boolean;
  'create-migrations-schema'?: boolean;
  'ignore-pattern'?: string;
  'use-glob'?: boolean;
  'check-order'?: boolean;
  'single-transaction'?: boolean;
  'no-lock'?: boolean;
};

const SUPPRESSED_PREFIX = "Can't determine timestamp for ";
const logger = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: (...params: unknown[]) => {
    const [first] = params;
    if (typeof first === 'string' && first.startsWith(SUPPRESSED_PREFIX)) {
      return;
    }
    console.error(...params);
  },
};

const configPath = resolve(process.cwd(), '.pgmigrate.json');
const raw = JSON.parse(readFileSync(configPath, 'utf8')) as RawConfig;

const direction = process.argv[2] ?? 'up';
if (!['up', 'down', 'redo'].includes(direction)) {
  console.error('Invalid action. Use "up", "down", or "redo".');
  process.exit(1);
}

const target = process.argv[3];
let count: number | undefined;
let file: string | undefined;
if (target) {
  if (/^\\d+$/.test(target)) {
    count = Number.parseInt(target, 10);
  } else {
    file = target;
  }
}

const databaseUrl = process.env.DATABASE_URL ?? raw.url;
if (!databaseUrl) {
  console.error('Missing DATABASE_URL or .pgmigrate.json url.');
  process.exit(1);
}

const baseOptions = {
  databaseUrl,
  dir: raw['migrations-dir'] ?? 'migrations',
  migrationsTable: raw['migrations-table'] ?? 'pgmigrations',
  migrationsSchema: raw['migrations-schema'],
  schema: raw.schema,
  createSchema: raw['create-schema'] ?? false,
  createMigrationsSchema: raw['create-migrations-schema'] ?? false,
  ignorePattern: raw['ignore-pattern'] ?? '\\\\..*',
  useGlob: raw['use-glob'] ?? false,
  checkOrder: raw['check-order'] ?? true,
  verbose: raw.verbose ?? true,
  decamelize: raw.decamelize ?? false,
  singleTransaction: raw['single-transaction'] ?? true,
  noLock: raw['no-lock'] ?? false,
  logger,
};

const run = async (dir: 'up' | 'down') => {
  await runner({
    ...baseOptions,
    direction: dir,
    ...(typeof count === 'number' ? { count } : {}),
    ...(file ? { file } : {}),
  });
};

const execute = async () => {
  if (direction === 'redo') {
    await run('down');
    await runner({
      ...baseOptions,
      direction: 'up',
      count: Number.POSITIVE_INFINITY,
      timestamp: false,
    });
    return;
  }
  await run(direction as 'up' | 'down');
};

execute().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const successRunId = 999_999_021;
const missingRunId = 999_999_022;

const requiredRelativePaths = (runId: number) => [
  `artifacts/release/post-release-health-run-${String(runId)}.json`,
  `artifacts/release/post-release-health-summary-${String(runId)}.json`,
  `artifacts/release/post-release-health-schema-summary-${String(runId)}.json`,
];

const writeReportFixtures = async (runId: number, count: number) => {
  const files = requiredRelativePaths(runId).slice(0, count);
  for (const relativePath of files) {
    const absolutePath = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, '{"status":"pass"}\n', 'utf8');
  }
};

const removeReportFixtures = async (runId: number) => {
  const files = requiredRelativePaths(runId);
  for (const relativePath of files) {
    const absolutePath = path.join(projectRoot, relativePath);
    await rm(absolutePath, { force: true });
  }
};

describe('inline post-release health artifacts validator', () => {
  beforeAll(async () => {
    await writeReportFixtures(successRunId, 3);
    await writeReportFixtures(missingRunId, 2);
  });

  afterAll(async () => {
    await removeReportFixtures(successRunId);
    await removeReportFixtures(missingRunId);
  });

  test('passes in strict mode when all inline artifacts exist', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/validate-inline-post-release-health-artifacts.mjs',
        '--run-id',
        String(successRunId),
        '--strict',
        '--json',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.status).toBe('pass');
    expect(payload.presentTotal).toBe(3);
    expect(payload.missing).toEqual([]);
  });

  test('fails in strict mode when inline artifacts are missing', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/validate-inline-post-release-health-artifacts.mjs',
        '--run-id',
        String(missingRunId),
        '--strict',
        '--json',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.status).toBe('fail');
    expect(payload.presentTotal).toBe(2);
    expect(payload.missing).toEqual([
      `artifacts/release/post-release-health-schema-summary-${String(missingRunId)}.json`,
    ]);
  });

  test('returns fail status but exits zero when strict mode is disabled', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/validate-inline-post-release-health-artifacts.mjs',
        '--run-id',
        String(missingRunId),
        '--json',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.status).toBe('fail');
    expect(payload.strict).toBe(false);
    expect(payload.missing.length).toBe(1);
  });
});

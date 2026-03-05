import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const runId = 999_999_025;
const summaryRelativePath = `artifacts/release/production-launch-gate-summary-render-${String(runId)}.json`;
const inlineHealthSummaryRelativePath = `artifacts/release/post-release-health-inline-artifacts-summary-${String(runId)}.json`;
const inlineSchemaCheckRelativePath = `artifacts/release/post-release-health-inline-artifacts-schema-check-${String(runId)}.json`;
const outputRelativePath = `artifacts/release/production-launch-gate-step-summary-${String(runId)}.md`;
const missingSummaryOutputRelativePath = `artifacts/release/production-launch-gate-step-summary-${String(runId)}-missing.md`;

const createSummaryPayload = () => ({
  status: 'pass',
  pass: true,
  config: {
    environment: 'production',
    runtimeDraftId: '',
    requireSkillMarkers: false,
    requireNaturalCronWindow: false,
    requiredExternalChannels: ['telegram', 'slack', 'discord'],
  },
  checks: {
    smoke: {
      pass: true,
      skipped: false,
    },
    inlineHealthArtifactsSchema: {
      pass: true,
      skipped: false,
      status: 'pass',
      runtimeSummaryPath:
        'artifacts/release/post-release-health-inline-artifacts-summary-22713152118.json',
    },
    sandboxExecutionEgressPolicy: {
      pass: true,
      skipped: true,
    },
  },
});

const createInlineHealthSummaryPayload = () => ({
  schemaPath:
    'docs/ops/schemas/release-inline-health-artifacts-summary-output.schema.json',
  schemaVersion: '1.0.0',
  label: 'release:health:inline-artifacts:check',
  status: 'pass',
  strict: true,
  runId,
  requiredTotal: 3,
  presentTotal: 3,
  present: [
    `artifacts/release/post-release-health-run-${String(runId)}.json`,
    `artifacts/release/post-release-health-summary-${String(runId)}.json`,
    `artifacts/release/post-release-health-schema-summary-${String(runId)}.json`,
  ],
  missing: [],
  checks: [],
  generatedAtUtc: '2026-03-05T10:18:00.000Z',
});

const createInlineSchemaCheckPayload = () => ({
  label: 'release:health:inline-artifacts:schema:check',
  mode: 'inline-health-artifacts-summary',
  status: 'pass',
  totals: {
    fixturePayloads: 1,
    runtimePayloads: 1,
    validatedPayloads: 2,
  },
  runtimeSummaryPath: inlineHealthSummaryRelativePath,
  failures: [],
});

const writeFixture = async (relativePath: string, payload: unknown) => {
  const absolutePath = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
};

const removeFixture = async (relativePath: string) => {
  const absolutePath = path.join(projectRoot, relativePath);
  await rm(absolutePath, { force: true });
};

const runRenderScript = ({
  outputPath,
  summaryPath,
}: {
  outputPath: string;
  summaryPath: string;
}) =>
  spawnSync(
    process.execPath,
    [
      'scripts/release/render-production-launch-gate-step-summary.mjs',
      '--run-id',
      String(runId),
      '--output',
      outputPath,
      '--summary',
      summaryPath,
      '--inline-health-summary',
      inlineHealthSummaryRelativePath,
      '--inline-schema-check',
      inlineSchemaCheckRelativePath,
      '--require-inline-health-artifacts',
      'true',
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
    },
  );

describe('production launch-gate step summary renderer', () => {
  afterAll(async () => {
    await removeFixture(summaryRelativePath);
    await removeFixture(inlineHealthSummaryRelativePath);
    await removeFixture(inlineSchemaCheckRelativePath);
    await removeFixture(outputRelativePath);
    await removeFixture(missingSummaryOutputRelativePath);
  });

  test('renders checks section with inlineHealthArtifactsSchema visibility', async () => {
    await writeFixture(summaryRelativePath, createSummaryPayload());
    await writeFixture(
      inlineHealthSummaryRelativePath,
      createInlineHealthSummaryPayload(),
    );
    await writeFixture(
      inlineSchemaCheckRelativePath,
      createInlineSchemaCheckPayload(),
    );

    const result = runRenderScript({
      outputPath: outputRelativePath,
      summaryPath: summaryRelativePath,
    });

    expect(result.status).toBe(0);
    const outputAbsolutePath = path.join(projectRoot, outputRelativePath);
    const markdown = await readFile(outputAbsolutePath, 'utf8');
    expect(markdown).toContain('### Checks');
    expect(markdown).toContain('- inlineHealthArtifactsSchema: `PASS`');
    expect(markdown).toContain(
      '- inline post-release health artifacts: `pass` (present `3/3`, strict `true`)',
    );
    expect(markdown).toContain(
      '- inline artifact summary schema check: `pass`',
    );
    expect(markdown).toContain('- sandboxExecutionEgressPolicy: `SKIPPED`');
  });

  test('renders explicit missing summary line when summary artifact is absent', async () => {
    const result = runRenderScript({
      outputPath: missingSummaryOutputRelativePath,
      summaryPath:
        'artifacts/release/production-launch-gate-summary-render-missing.json',
    });

    expect(result.status).toBe(0);
    const outputAbsolutePath = path.join(
      projectRoot,
      missingSummaryOutputRelativePath,
    );
    const markdown = await readFile(outputAbsolutePath, 'utf8');
    expect(markdown).toContain(
      '- summary artifact missing: `artifacts/release/production-launch-gate-summary-render-missing.json`',
    );
  });
});

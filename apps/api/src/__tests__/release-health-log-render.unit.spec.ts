import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const richFixtureRunId = 999_999_013;
const richFixtureReportPath = path.join(
  projectRoot,
  'artifacts',
  'release',
  `post-release-health-run-${String(richFixtureRunId)}.json`,
);
const sparseFixtureRunId = 999_999_014;
const sparseFixtureReportPath = path.join(
  projectRoot,
  'artifacts',
  'release',
  `post-release-health-run-${String(sparseFixtureRunId)}.json`,
);

const fixtureReport = {
  generatedAtUtc: '2026-03-05T09:40:00.000Z',
  run: {
    id: richFixtureRunId,
    runNumber: 913,
    htmlUrl:
      'https://github.com/Web-pixel-creator/SocialProject/actions/runs/999999013',
  },
  summary: {
    pass: true,
    requiredJobsPassed: 1,
    requiredJobsTotal: 1,
    requiredArtifactsPresent: 10,
    requiredArtifactsTotal: 10,
    failedJobsTotal: 0,
    reasons: [],
  },
  smokeReport: {
    summary: {
      pass: true,
      totalSteps: 19,
      failedSteps: 0,
    },
  },
  externalChannelFailureModes: {
    pass: true,
    source: 'artifact',
    analyzedRuns: [
      { runId: richFixtureRunId - 1 },
      { runId: richFixtureRunId },
    ],
  },
  releaseHealthAlertTelemetry: {
    status: 'healthy',
    riskLevel: 'healthy',
    source: 'api',
    evaluated: true,
    escalationTriggered: false,
  },
  launchGateSandboxChecks: {
    pass: true,
    source: 'local',
    available: true,
  },
};

const sparseFixtureReport = {
  generatedAtUtc: '2026-03-05T09:44:00.000Z',
  run: {
    id: sparseFixtureRunId,
    runNumber: 914,
    htmlUrl:
      'https://github.com/Web-pixel-creator/SocialProject/actions/runs/999999014',
  },
  summary: {
    pass: true,
    requiredJobsPassed: 1,
    requiredJobsTotal: 1,
    requiredArtifactsPresent: 10,
    requiredArtifactsTotal: 10,
    failedJobsTotal: 0,
    reasons: [],
  },
  smokeReport: {
    summary: null,
  },
};

describe('append post-release health log script', () => {
  beforeAll(async () => {
    await mkdir(path.dirname(richFixtureReportPath), { recursive: true });
    await writeFile(
      richFixtureReportPath,
      `${JSON.stringify(fixtureReport, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      sparseFixtureReportPath,
      `${JSON.stringify(sparseFixtureReport, null, 2)}\n`,
      'utf8',
    );
  });

  afterAll(async () => {
    await rm(richFixtureReportPath, { force: true });
    await rm(sparseFixtureReportPath, { force: true });
  });

  test('renders provenance fields in dry-run output', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/append-post-release-health-log.mjs',
        String(richFixtureRunId),
        '--dry-run',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain(
      '- External-channel trend: pass=true source=artifact analyzedRuns=2.',
    );
    expect(result.stdout).toContain(
      '- Release-health alert telemetry: status=healthy risk=healthy source=api evaluated=true escalation=false.',
    );
    expect(result.stdout).toContain(
      '- Launch-gate sandbox checks: pass=true source=local available=true.',
    );
  });

  test('keeps fallback output stable when optional blocks are missing', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/release/append-post-release-health-log.mjs',
        String(sparseFixtureRunId),
        '--dry-run',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('- Smoke summary: unavailable.');
    expect(result.stdout).not.toContain('- External-channel trend:');
    expect(result.stdout).not.toContain('- Release-health alert telemetry:');
    expect(result.stdout).not.toContain('- Launch-gate sandbox checks:');
  });
});

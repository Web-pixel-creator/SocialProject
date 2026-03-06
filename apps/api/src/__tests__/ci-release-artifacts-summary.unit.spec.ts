import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const artifactsRoot = path.join(projectRoot, 'artifacts', 'ci');
const { summarizeReleaseArtifacts } =
  require('../../../../scripts/ci/summarize-release-artifacts-core.js') as typeof import('../../../../scripts/ci/summarize-release-artifacts-core.js');

const createTempPath = (name: string) =>
  path.join(
    artifactsRoot,
    `ci-release-artifact-summary-${process.pid}-${Date.now()}-${name}`,
  );

describe('release artifact manifest summary', () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths
        .splice(0)
        .map((targetPath) => rm(targetPath, { force: true, recursive: true })),
    );
  });

  test('marks missing artifacts when none of the expected paths exist', async () => {
    const outputPath = createTempPath('missing.json');
    const markdownPath = createTempPath('missing.md');
    cleanupPaths.push(outputPath, markdownPath);

    const payload = summarizeReleaseArtifacts({
      artifacts: [
        {
          name: 'release-smoke-report',
          path: 'artifacts/release/smoke-results-missing.json',
        },
        {
          name: 'release-smoke-preflight-summary',
          path: 'artifacts/release/tunnel-preflight-summary-missing.json',
        },
      ],
      markdownOutputPath: markdownPath,
      outputPath,
    });

    expect(payload.status).toBe('missing');
    expect(payload.presentCount).toBe(0);
    expect(payload.missingCount).toBe(2);
    expect(payload.actionableMessages).toContain(
      "Artifact 'release-smoke-report' missing at artifacts/release/smoke-results-missing.json",
    );
    await expect(readFile(markdownPath, 'utf8')).resolves.toContain(
      'status: `missing`',
    );
  });

  test('marks partial artifacts when some expected paths are absent', async () => {
    const artifactDir = createTempPath('partial-dir');
    const outputPath = createTempPath('partial.json');
    cleanupPaths.push(artifactDir, outputPath);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(path.join(artifactDir, 'summary.json'), '{"ok":true}\n', 'utf8');

    const payload = summarizeReleaseArtifacts({
      artifacts: [
        {
          name: 'production-launch-gate-summary',
          path: artifactDir,
        },
        {
          name: 'production-launch-gate-health-summary',
          path: `${artifactDir}-missing`,
        },
      ],
      outputPath,
    });

    expect(payload.status).toBe('partial');
    expect(payload.presentCount).toBe(1);
    expect(payload.missingCount).toBe(1);
    expect(payload.artifacts[0]?.fileCount).toBe(1);
    expect(payload.artifacts[1]?.exists).toBe(false);
  });

  test('marks complete artifacts when all expected paths exist', async () => {
    const filePath = createTempPath('complete-file.json');
    const dirPath = createTempPath('complete-dir');
    const outputPath = createTempPath('complete.json');
    cleanupPaths.push(filePath, dirPath, outputPath);
    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, '{"pass":true}\n', 'utf8');
    await writeFile(path.join(dirPath, 'trace.json'), '{"trace":1}\n', 'utf8');

    const payload = summarizeReleaseArtifacts({
      artifacts: [
        {
          name: 'production-launch-gate-summary',
          path: filePath,
        },
        {
          name: 'production-external-channel-traces',
          path: dirPath,
        },
      ],
      outputPath,
    });

    expect(payload.status).toBe('complete');
    expect(payload.presentCount).toBe(2);
    expect(payload.missingCount).toBe(0);
    expect(payload.actionableMessages).toEqual([]);
  });
});

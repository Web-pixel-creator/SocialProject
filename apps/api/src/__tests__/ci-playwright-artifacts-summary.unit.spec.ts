import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const artifactsRoot = path.join(projectRoot, 'artifacts', 'ci');
const { summarizePlaywrightArtifacts } =
  require('../../../../scripts/ci/summarize-playwright-artifacts-core.js') as typeof import('../../../../scripts/ci/summarize-playwright-artifacts-core.js');

const createTempPath = (name: string) =>
  path.join(
    artifactsRoot,
    `ci-playwright-artifact-summary-${process.pid}-${Date.now()}-${name}`,
  );

describe('playwright artifact manifest summary', () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths
        .splice(0)
        .map((targetPath) => rm(targetPath, { force: true, recursive: true })),
    );
  });

  test('marks missing artifacts when report and results do not exist', async () => {
    const outputPath = createTempPath('missing.json');
    const markdownPath = createTempPath('missing.md');
    cleanupPaths.push(outputPath, markdownPath);

    const payload = summarizePlaywrightArtifacts({
      markdownOutputPath: markdownPath,
      outputPath,
      reportPath: 'apps/web/playwright-report-missing',
      resultsPath: 'apps/web/test-results-missing',
    });

    expect(payload.status).toBe('missing');
    expect(payload.report.exists).toBe(false);
    expect(payload.results?.exists).toBe(false);
    expect(payload.actionableMessages).toContain(
      'Playwright report missing at apps/web/playwright-report-missing',
    );
    await expect(readFile(markdownPath, 'utf8')).resolves.toContain(
      'status: `missing`',
    );
  });

  test('marks partial artifacts when report exists but results are absent', async () => {
    const reportDir = createTempPath('report');
    const outputPath = createTempPath('partial.json');
    cleanupPaths.push(reportDir, outputPath);
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      path.join(reportDir, 'index.html'),
      '<html></html>',
      'utf8',
    );

    const payload = summarizePlaywrightArtifacts({
      outputPath,
      reportPath: reportDir,
      resultsPath: `${reportDir}-results`,
    });

    expect(payload.status).toBe('partial');
    expect(payload.report.exists).toBe(true);
    expect(payload.report.fileCount).toBe(1);
    expect(payload.results?.exists).toBe(false);
  });

  test('marks complete artifacts when both report and results exist', async () => {
    const reportDir = createTempPath('complete-report');
    const resultsDir = createTempPath('complete-results');
    const outputPath = createTempPath('complete.json');
    cleanupPaths.push(reportDir, resultsDir, outputPath);
    await mkdir(reportDir, { recursive: true });
    await mkdir(resultsDir, { recursive: true });
    await writeFile(
      path.join(reportDir, 'index.html'),
      '<html></html>',
      'utf8',
    );
    await writeFile(path.join(resultsDir, 'trace.zip'), 'trace', 'utf8');

    const payload = summarizePlaywrightArtifacts({
      outputPath,
      reportPath: reportDir,
      resultsPath: resultsDir,
    });

    expect(payload.status).toBe('complete');
    expect(payload.report.exists).toBe(true);
    expect(payload.results?.exists).toBe(true);
    expect(payload.actionableMessages).toEqual([]);
  });
});

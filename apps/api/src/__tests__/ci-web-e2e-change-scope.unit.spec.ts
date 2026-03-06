import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..', '..', '..');
const artifactsRoot = path.join(projectRoot, 'artifacts', 'ci');
const { classifyWebE2EChanges } =
  require('../../../../scripts/ci/classify-web-e2e-changes-core.js') as typeof import('../../../../scripts/ci/classify-web-e2e-changes-core.js');

const createTempPath = (name: string) =>
  path.join(
    artifactsRoot,
    `ci-web-e2e-change-scope-${process.pid}-${Date.now()}-${name}`,
  );

describe('CI web E2E change scope classifier', () => {
  const cleanupPaths: string[] = [];

  afterEach(async () => {
    await Promise.all(
      cleanupPaths
        .splice(0)
        .map((targetPath) => rm(targetPath, { force: true, recursive: true })),
    );
  });

  test('selects critical and visual suites for web source changes', async () => {
    const jsonPath = createTempPath('web-source.json');
    const markdownPath = createTempPath('web-source.md');
    cleanupPaths.push(jsonPath, markdownPath);

    const payload = classifyWebE2EChanges({
      changedPaths: ['apps/web/src/app/page.tsx'],
      markdownOutputPath: markdownPath,
      outputPath: jsonPath,
      title: 'Classifier test',
    });

    expect(payload.selection.runCritical).toBe(true);
    expect(payload.selection.runVisual).toBe(true);
    expect(
      payload.criticalMatches.map((entry: { id: string }) => entry.id),
    ).toContain('web_source');
    expect(
      payload.visualMatches.map((entry: { id: string }) => entry.id),
    ).toContain('web_source');
    await expect(readFile(markdownPath, 'utf8')).resolves.toContain(
      'run critical: `true`',
    );
  });

  test('selects critical and visual suites for public asset changes', () => {
    const jsonPath = createTempPath('public-assets.json');
    cleanupPaths.push(jsonPath);

    const payload = classifyWebE2EChanges({
      changedPaths: ['apps/web/public/og/feed-card.png'],
      outputPath: jsonPath,
    });

    expect(payload.selection.runCritical).toBe(true);
    expect(payload.selection.runVisual).toBe(true);
    expect(
      payload.criticalMatches.map((entry: { id: string }) => entry.id),
    ).toContain('web_public_assets');
    expect(
      payload.visualMatches.map((entry: { id: string }) => entry.id),
    ).toContain('web_public_assets');
  });

  test('selects only critical suite for API public route changes', () => {
    const jsonPath = createTempPath('api-route.json');
    cleanupPaths.push(jsonPath);

    const payload = classifyWebE2EChanges({
      changedPaths: ['apps/api/src/routes/search.ts'],
      outputPath: jsonPath,
    });

    expect(payload.selection.runCritical).toBe(true);
    expect(payload.selection.runVisual).toBe(false);
    expect(
      payload.criticalMatches.map((entry: { id: string }) => entry.id),
    ).toContain('api_public_routes');
  });

  test('selects only visual suite for visual baseline changes', () => {
    const jsonPath = createTempPath('visual.json');
    cleanupPaths.push(jsonPath);

    const payload = classifyWebE2EChanges({
      changedPaths: [
        'apps/web/e2e/visual-smoke.spec.ts-snapshots/homepage-chromium.png',
      ],
      outputPath: jsonPath,
    });

    expect(payload.selection.runCritical).toBe(false);
    expect(payload.selection.runVisual).toBe(true);
    expect(
      payload.visualMatches.map((entry: { id: string }) => entry.id),
    ).toContain('visual_baselines');
  });

  test('skips both suites for docs-only changes and writes GitHub outputs', async () => {
    const jsonPath = createTempPath('docs.json');
    const githubOutputPath = createTempPath('docs.github-output');
    cleanupPaths.push(jsonPath, githubOutputPath);
    await mkdir(path.dirname(githubOutputPath), { recursive: true });

    const payload = classifyWebE2EChanges({
      changedPaths: ['docs/ops/release-log.md'],
      githubOutputPath,
      outputPath: jsonPath,
    });

    expect(payload.selection.runCritical).toBe(false);
    expect(payload.selection.runVisual).toBe(false);
    expect(payload.unmatchedPaths).toEqual(['docs/ops/release-log.md']);

    const githubOutput = await readFile(githubOutputPath, 'utf8');
    expect(githubOutput).toContain('run_critical=false');
    expect(githubOutput).toContain('run_visual=false');
    expect(githubOutput).toContain('changed_paths_count=1');
  });
});

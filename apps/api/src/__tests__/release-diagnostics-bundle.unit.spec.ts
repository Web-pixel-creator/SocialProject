import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'release-diagnostics-bundle-utils.mjs',
);

const makeTempDir = () =>
  mkdtempSync(path.join(os.tmpdir(), 'socialproject-diagnostics-'));

describe('release diagnostics bundle helper', () => {
  test('captures a diagnostics bundle and copies available artifacts', () => {
    const tempDir = makeTempDir();
    try {
      const sourceSummaryPath = path.join(tempDir, 'summary.json');
      writeFileSync(
        sourceSummaryPath,
        `${JSON.stringify({ status: 'fail' }, null, 2)}\n`,
        'utf8',
      );
      const result = runInlineModuleScript<{
        error: string;
        ok: boolean;
        result: Record<string, unknown> | null;
      }>(`
        import { captureReleaseDiagnosticsBundle } from ${JSON.stringify(
          helperModuleHref,
        )};
        const bundle = await captureReleaseDiagnosticsBundle({
          artifactFiles: [
            { label: 'summary', path: ${JSON.stringify(sourceSummaryPath)} },
            { label: 'missing', path: ${JSON.stringify(
              path.join(tempDir, 'missing.json'),
            )} },
          ],
          cleanupConfig: {
            dryRun: false,
            enabled: false,
            maxBundles: 5,
            maxFiles: 20,
            ttlDays: 14,
          },
          clock: () => new Date('2026-03-06T04:30:00.000Z'),
          correlation: {
            releaseRunId: 'rel.test.bundle',
            correlationId: 'rel.test.bundle.corr',
            auditSessionId: 'rel.test.bundle.audit',
          },
          outputDir: ${JSON.stringify(path.join(tempDir, 'bundles'))},
          source: 'production-launch-gate',
          summary: {
            checks: {
              smoke: { pass: false },
            },
            diagnosticsMeta: {
              smokeRetriesUsed: 1,
            },
            pass: false,
            status: 'fail',
          },
          triggers: [
            {
              code: 'launch_gate_failed',
              message: 'Production launch gate ended in fail state.',
              severity: 'high',
            },
          ],
          workspaceRoot: ${JSON.stringify(tempDir)},
        });
        process.stdout.write(
          JSON.stringify({
            ok: true,
            result: {
              artifacts: bundle.artifacts,
              bundlePath: bundle.bundlePath,
              cleanupSummary: bundle.cleanupSummary,
              manifestPath: bundle.manifestPath,
              triggerCodes: bundle.triggers.map((trigger) => trigger.code),
            },
            error: '',
          }),
        );
      `);

      expect(result.output.status).toBe(0);
      expect(result.payload.ok).toBe(true);
      expect(result.payload.result?.triggerCodes).toEqual([
        'launch_gate_failed',
      ]);
      const artifacts = result.payload.result?.artifacts as Record<
        string,
        unknown
      >[];
      expect(artifacts).toHaveLength(2);
      expect(artifacts[0]).toMatchObject({
        copied: true,
        label: 'summary',
        present: true,
      });
      expect(artifacts[1]).toMatchObject({
        copied: false,
        label: 'missing',
        present: false,
        reason: 'source file missing',
      });
      const manifestPath = path.join(
        tempDir,
        String(result.payload.result?.manifestPath),
      );
      const manifestPayload = JSON.parse(readFileSync(manifestPath, 'utf8'));
      expect(manifestPayload.summary).toMatchObject({
        failedChecks: ['smoke'],
        pass: false,
        smokeRetriesUsed: 1,
        status: 'fail',
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test('cleanup removes the oldest non-protected bundles when maxBundles is exceeded', () => {
    const tempDir = makeTempDir();
    try {
      const bundlesDir = path.join(tempDir, 'bundles');
      const oldestBundleDir = path.join(bundlesDir, 'bundle-oldest');
      const newestBundleDir = path.join(bundlesDir, 'bundle-newest');
      for (const dirPath of [oldestBundleDir, newestBundleDir]) {
        const artifactsDir = path.join(dirPath, 'artifacts');
        rmSync(dirPath, { force: true, recursive: true });
        mkdirSync(artifactsDir, { recursive: true });
        writeFileSync(
          path.join(dirPath, 'release-diagnostics-bundle.json'),
          '{}\n',
          'utf8',
        );
        writeFileSync(path.join(artifactsDir, 'summary.json'), '{}\n', 'utf8');
      }
      utimesSync(
        path.join(oldestBundleDir, 'release-diagnostics-bundle.json'),
        new Date('2026-03-04T00:00:00.000Z'),
        new Date('2026-03-04T00:00:00.000Z'),
      );
      utimesSync(
        path.join(newestBundleDir, 'release-diagnostics-bundle.json'),
        new Date('2026-03-06T00:00:00.000Z'),
        new Date('2026-03-06T00:00:00.000Z'),
      );

      const result = runInlineModuleScript<{
        error: string;
        ok: boolean;
        result: Record<string, unknown> | null;
      }>(`
        import { cleanupReleaseDiagnosticsBundles } from ${JSON.stringify(
          helperModuleHref,
        )};
        const summary = await cleanupReleaseDiagnosticsBundles({
          dryRun: false,
          enabled: true,
          maxBundles: 1,
          maxFiles: 10,
          nowMs: Date.parse('2026-03-06T12:00:00.000Z'),
          outputDir: ${JSON.stringify(bundlesDir)},
          protectedBundleDir: ${JSON.stringify(newestBundleDir)},
          ttlDays: 14,
        });
        process.stdout.write(
          JSON.stringify({
            ok: true,
            result: summary,
            error: '',
          }),
        );
      `);

      expect(result.output.status).toBe(0);
      expect(result.payload.result).toMatchObject({
        keptBundles: 1,
        matchedBundles: 2,
        removedBundles: 1,
      });
      expect(existsSync(oldestBundleDir)).toBe(false);
      expect(existsSync(newestBundleDir)).toBe(true);
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

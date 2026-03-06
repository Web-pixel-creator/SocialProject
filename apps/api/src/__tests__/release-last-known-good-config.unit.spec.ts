import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveProjectModuleHref,
  runInlineModuleScript,
} from './module-runner.util';

const helperModuleHref = resolveProjectModuleHref(
  'scripts',
  'release',
  'release-last-known-good-config.mjs',
);

const makeTempDir = () =>
  mkdtempSync(path.join(os.tmpdir(), 'socialproject-lkg-'));

describe('release last-known-good config helper', () => {
  test('persists a valid candidate snapshot', () => {
    const tempDir = makeTempDir();
    try {
      const snapshotPath = path.join(tempDir, 'lkg.json');
      const resolutionPath = path.join(tempDir, 'resolution.json');
      const result = runInlineModuleScript<{
        error: string;
        ok: boolean;
        result: Record<string, unknown> | null;
      }>(`
        import { resolveLastKnownGoodConfig } from ${JSON.stringify(
          helperModuleHref,
        )};
        const resolved = await resolveLastKnownGoodConfig({
          candidateSnapshot: {
            sandboxExecutionEnabledConfig: {
              source: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
              value: 'true',
            },
          },
          resolutionPath: ${JSON.stringify(resolutionPath)},
          scope: 'test-scope',
          snapshotPath: ${JSON.stringify(snapshotPath)},
          validateSnapshot: (snapshot) => {
            if (snapshot?.sandboxExecutionEnabledConfig?.value !== 'true') {
              throw new Error('invalid snapshot');
            }
            return { mode: 'sandbox_enabled' };
          },
        });
        process.stdout.write(
          JSON.stringify({
            ok: true,
            result: {
              activeSource: resolved.resolution.active?.source ?? null,
              candidateValid: resolved.resolution.candidate.valid,
              fallbackUsed: resolved.resolution.fallback.used,
              validatedMode: resolved.validatedActiveSnapshot.mode,
            },
            error: '',
          }),
        );
      `);

      expect(result.output.status).toBe(0);
      expect(result.payload.result).toEqual({
        activeSource: 'candidate',
        candidateValid: true,
        fallbackUsed: false,
        validatedMode: 'sandbox_enabled',
      });
      const snapshotPayload = JSON.parse(readFileSync(snapshotPath, 'utf8'));
      expect(snapshotPayload.scope).toBe('test-scope');
      expect(snapshotPayload.snapshot).toMatchObject({
        sandboxExecutionEnabledConfig: {
          source: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
          value: 'true',
        },
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test('falls back to the last known good snapshot when candidate validation fails', () => {
    const tempDir = makeTempDir();
    try {
      const snapshotPath = path.join(tempDir, 'lkg.json');
      const resolutionPath = path.join(tempDir, 'resolution.json');
      const seedResult = runInlineModuleScript<{
        error: string;
        ok: boolean;
        result: Record<string, unknown> | null;
      }>(`
        import { resolveLastKnownGoodConfig } from ${JSON.stringify(
          helperModuleHref,
        )};
        await resolveLastKnownGoodConfig({
          candidateSnapshot: {
            sandboxExecutionEnabledConfig: {
              source: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
              value: 'true',
            },
          },
          resolutionPath: ${JSON.stringify(resolutionPath)},
          scope: 'test-scope',
          snapshotPath: ${JSON.stringify(snapshotPath)},
          validateSnapshot: (snapshot) => {
            if (snapshot?.sandboxExecutionEnabledConfig?.value !== 'true') {
              throw new Error('invalid snapshot');
            }
            return { mode: 'sandbox_enabled' };
          },
        });
        process.stdout.write(JSON.stringify({ ok: true, result: {}, error: '' }));
      `);

      expect(seedResult.output.status).toBe(0);

      const result = runInlineModuleScript<{
        error: string;
        ok: boolean;
        result: Record<string, unknown> | null;
      }>(`
        import { resolveLastKnownGoodConfig } from ${JSON.stringify(
          helperModuleHref,
        )};
        const resolved = await resolveLastKnownGoodConfig({
          candidateSnapshot: {
            sandboxExecutionEnabledConfig: {
              source: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
              value: 'maybe',
            },
          },
          resolutionPath: ${JSON.stringify(resolutionPath)},
          scope: 'test-scope',
          snapshotPath: ${JSON.stringify(snapshotPath)},
          validateSnapshot: (snapshot) => {
            if (snapshot?.sandboxExecutionEnabledConfig?.value !== 'true') {
              throw new Error('invalid snapshot');
            }
            return { mode: 'sandbox_enabled' };
          },
        });
        process.stdout.write(
          JSON.stringify({
            ok: true,
            result: {
              activeSource: resolved.resolution.active?.source ?? null,
              candidateValid: resolved.resolution.candidate.valid,
              fallbackReason: resolved.resolution.fallback.reason,
              fallbackUsed: resolved.resolution.fallback.used,
              validatedMode: resolved.validatedActiveSnapshot.mode,
            },
            error: '',
          }),
        );
      `);

      expect(result.output.status).toBe(0);
      expect(result.payload.result).toEqual({
        activeSource: 'last_known_good',
        candidateValid: false,
        fallbackReason: 'invalid snapshot',
        fallbackUsed: true,
        validatedMode: 'sandbox_enabled',
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  test('fails with a structured error when no valid snapshot is available', () => {
    const tempDir = makeTempDir();
    try {
      const snapshotPath = path.join(tempDir, 'lkg.json');
      const resolutionPath = path.join(tempDir, 'resolution.json');
      const result = runInlineModuleScript<{
        code: string;
        error: string;
        ok: boolean;
        result: null;
      }>(`
        import {
          resolveLastKnownGoodConfig,
          toLastKnownGoodConfigErrorPayload,
        } from ${JSON.stringify(helperModuleHref)};
        try {
          await resolveLastKnownGoodConfig({
            candidateSnapshot: {
              sandboxExecutionEnabledConfig: {
                source: 'RELEASE_SANDBOX_EXECUTION_ENABLED',
                value: 'maybe',
              },
            },
            resolutionPath: ${JSON.stringify(resolutionPath)},
            scope: 'test-scope',
            snapshotPath: ${JSON.stringify(snapshotPath)},
            validateSnapshot: (snapshot) => {
              if (snapshot?.sandboxExecutionEnabledConfig?.value !== 'true') {
                throw new Error('invalid snapshot');
              }
              return { mode: 'sandbox_enabled' };
            },
          });
          process.stdout.write(
            JSON.stringify({ ok: true, result: null, error: '', code: '' }),
          );
        } catch (error) {
          const payload = toLastKnownGoodConfigErrorPayload(error);
          process.stdout.write(
            JSON.stringify({
              ok: false,
              result: null,
              error: error instanceof Error ? error.message : String(error),
              code: payload?.code ?? '',
            }),
          );
          process.exitCode = 1;
        }
      `);

      expect(result.output.status).toBe(1);
      expect(result.payload.ok).toBe(false);
      expect(result.payload.code).toBe(
        'RELEASE_LAST_KNOWN_GOOD_CONFIG_UNAVAILABLE',
      );
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

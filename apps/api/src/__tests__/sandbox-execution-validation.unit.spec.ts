import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  findInvalidProviderIdentifiers,
  normalizeProviderIdentifiers,
  normalizeSandboxId,
  redactSensitiveTelemetryText,
  sanitizeErrorMessage,
  validateSandboxPathWithinRoot,
} from '../services/sandboxExecution/validation';

describe('sandbox execution validation helpers', () => {
  test('normalizes provider identifiers and de-duplicates values', () => {
    expect(
      normalizeProviderIdentifiers([' GPT-4.1 ', 'gpt-4.1', 'claude-4', '   ']),
    ).toEqual(['gpt-4.1', 'claude-4']);
  });

  test('detects invalid provider identifiers', () => {
    expect(
      findInvalidProviderIdentifiers(['gpt-4.1', 'gpt-\n4.1', 'bad/provider']),
    ).toEqual(['gpt-\n4.1', 'bad/provider']);
  });

  test('normalizes sandbox id only when format is valid', () => {
    expect(normalizeSandboxId(' sbx_0123456789abcdef0123456789abcdef ')).toBe(
      'sbx_0123456789abcdef0123456789abcdef',
    );
    expect(normalizeSandboxId('sbx_123')).toBeNull();
    expect(
      normalizeSandboxId('../sbx_0123456789abcdef0123456789abcdef'),
    ).toBeNull();
  });

  test('redacts sensitive telemetry fragments', () => {
    expect(
      redactSensitiveTelemetryText(
        'sourceRoute=/api/admin?token=abc123 Authorization=Bearer test.jwt.token',
      ),
    ).toContain('token=<redacted>');
  });

  test('sanitizes and truncates error messages', () => {
    const error = new Error(
      'upstream failed apiKey=super-secret-value and token=123456',
    );
    const message = sanitizeErrorMessage(error, 80);
    expect(message).toContain('<redacted>');
    expect((message ?? '').length).toBeLessThanOrEqual(83);
  });
});

describe('validateSandboxPathWithinRoot', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'sandbox-validation-'));
  });

  afterEach(async () => {
    await rm(rootDir, { force: true, recursive: true });
  });

  test('accepts safe paths within root', async () => {
    await mkdir(path.join(rootDir, 'artifacts'), { recursive: true });
    const result = await validateSandboxPathWithinRoot({
      requireDirectory: false,
      requireExisting: false,
      rootDir,
      sandboxPath: 'artifacts/output.txt',
    });
    expect(result.ok).toBe(true);
  });

  test('rejects traversal outside root', async () => {
    const result = await validateSandboxPathWithinRoot({
      requireDirectory: false,
      requireExisting: false,
      rootDir,
      sandboxPath: '../escape.txt',
    });
    expect(result).toMatchObject({ ok: false, reason: 'outside_root' });
  });

  test('rejects control characters in path', async () => {
    const result = await validateSandboxPathWithinRoot({
      requireDirectory: false,
      requireExisting: false,
      rootDir,
      sandboxPath: 'bad\npath.txt',
    });
    expect(result).toMatchObject({ ok: false, reason: 'control_chars' });
  });

  test('rejects missing files when requireExisting is enabled', async () => {
    const result = await validateSandboxPathWithinRoot({
      requireDirectory: false,
      requireExisting: true,
      rootDir,
      sandboxPath: 'missing.txt',
    });
    expect(result).toMatchObject({ ok: false, reason: 'not_found' });
  });

  test('rejects non-directory paths when requireDirectory is enabled', async () => {
    await writeFile(path.join(rootDir, 'artifact.txt'), 'ok', 'utf8');
    const result = await validateSandboxPathWithinRoot({
      requireDirectory: true,
      requireExisting: true,
      rootDir,
      sandboxPath: 'artifact.txt',
    });
    expect(result).toMatchObject({ ok: false, reason: 'not_directory' });
  });

  test('rejects symlink escape when target points outside root', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const outsideDir = await mkdtemp(
      path.join(os.tmpdir(), 'sandbox-outside-'),
    );
    try {
      await mkdir(path.join(rootDir, 'links'), { recursive: true });
      await symlink(outsideDir, path.join(rootDir, 'links', 'escape'));
      const result = await validateSandboxPathWithinRoot({
        requireDirectory: false,
        requireExisting: false,
        rootDir,
        sandboxPath: 'links/escape/owned.txt',
      });
      expect(result).toMatchObject({ ok: false, reason: 'outside_root' });
    } finally {
      await rm(outsideDir, { force: true, recursive: true });
    }
  });
});

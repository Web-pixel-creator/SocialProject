import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

const PROVIDER_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SANDBOX_ID_PATTERN = /^sbx_[a-f0-9]{32}$/;
const SENSITIVE_KEY_VALUE_PATTERN =
  /\b(token|secret|password|api[_-]?key|authorization)\s*([:=])\s*([^\s,&]+)/gi;
const BEARER_TOKEN_PATTERN = /\bbearer\s+[a-z0-9._~+/=-]+\b/gi;
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g;

export type SandboxPathValidationReason =
  | 'control_chars'
  | 'empty_path'
  | 'not_directory'
  | 'not_found'
  | 'outside_root';

export type SandboxPathValidationResult =
  | {
      normalizedPath: string;
      ok: true;
      resolvedPath: string;
    }
  | {
      normalizedPath: string | null;
      ok: false;
      reason: SandboxPathValidationReason;
    };

interface SandboxPathValidationInput {
  requireDirectory: boolean;
  requireExisting: boolean;
  rootDir: string;
  sandboxPath: unknown;
}

const isPathWithin = (rootPath: string, targetPath: string): boolean => {
  const relativePath = path.relative(rootPath, targetPath);
  return !(
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath) ||
    relativePath.length === 0
  );
};

const normalizeFilesystemPath = (value: string): string =>
  process.platform === 'win32' ? value.toLowerCase() : value;

const resolveExistingAncestorRealpath = async (
  initialPath: string,
): Promise<string | null> => {
  let candidate = initialPath;
  while (true) {
    try {
      return await realpath(candidate);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
      const parent = path.dirname(candidate);
      if (parent === candidate) {
        return null;
      }
      candidate = parent;
    }
  }
};

const canonicalizeRootPath = async (rootDir: string): Promise<string> => {
  try {
    return await realpath(rootDir);
  } catch {
    return path.resolve(rootDir);
  }
};

export const containsControlChars = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }
  return false;
};

export const normalizeProviderIdentifier = (value: string): string =>
  value.trim().toLowerCase();

export const normalizeProviderIdentifiers = (
  value: string[] | undefined,
): string[] =>
  Array.from(
    new Set(
      (value ?? [])
        .map((provider) => normalizeProviderIdentifier(provider))
        .filter((provider) => provider.length > 0),
    ),
  );

export const findInvalidProviderIdentifiers = (
  providerIdentifiers: readonly string[],
): string[] =>
  providerIdentifiers.filter(
    (provider) =>
      containsControlChars(provider) ||
      !PROVIDER_IDENTIFIER_PATTERN.test(provider),
  );

export const normalizeSandboxId = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length < 1 || containsControlChars(normalized)) {
    return null;
  }
  return SANDBOX_ID_PATTERN.test(normalized) ? normalized : null;
};

export const redactSensitiveTelemetryText = (value: string): string =>
  value
    .replace(
      SENSITIVE_KEY_VALUE_PATTERN,
      (_whole, key: string, delimiter: string) =>
        `${key}${delimiter}<redacted>`,
    )
    .replace(BEARER_TOKEN_PATTERN, 'bearer <redacted>')
    .replace(JWT_PATTERN, '<redacted.jwt>');

export const normalizeAuditField = (
  value: unknown,
  maxLength: number,
): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length < 1 || containsControlChars(trimmed)) {
    return null;
  }
  const redacted = redactSensitiveTelemetryText(trimmed);
  return redacted.length > maxLength ? redacted.slice(0, maxLength) : redacted;
};

export const sanitizeErrorMessage = (
  error: unknown,
  maxLength: number,
): string | null => {
  if (!(error instanceof Error)) {
    return null;
  }
  const trimmed = error.message.trim();
  if (trimmed.length < 1) {
    return null;
  }
  const redacted = redactSensitiveTelemetryText(trimmed);
  return redacted.length > maxLength
    ? `${redacted.slice(0, maxLength)}...`
    : redacted;
};

export const validateSandboxPathWithinRoot = async ({
  requireDirectory,
  requireExisting,
  rootDir,
  sandboxPath,
}: SandboxPathValidationInput): Promise<SandboxPathValidationResult> => {
  if (typeof sandboxPath !== 'string') {
    return { normalizedPath: null, ok: false, reason: 'empty_path' };
  }
  const normalizedPath = sandboxPath.trim();
  if (normalizedPath.length < 1) {
    return { normalizedPath, ok: false, reason: 'empty_path' };
  }
  if (containsControlChars(normalizedPath)) {
    return { normalizedPath, ok: false, reason: 'control_chars' };
  }

  const rootPath = path.resolve(rootDir);
  const resolvedPath = path.resolve(rootPath, normalizedPath);
  const relativePath = path.relative(rootPath, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return { normalizedPath, ok: false, reason: 'outside_root' };
  }

  const canonicalRootPath = normalizeFilesystemPath(
    await canonicalizeRootPath(rootPath),
  );
  const boundaryPath = requireExisting
    ? resolvedPath
    : path.dirname(resolvedPath);
  const canonicalBoundaryPath =
    await resolveExistingAncestorRealpath(boundaryPath);

  if (canonicalBoundaryPath !== null) {
    const normalizedBoundaryPath = normalizeFilesystemPath(
      canonicalBoundaryPath,
    );
    if (
      normalizedBoundaryPath !== canonicalRootPath &&
      !isPathWithin(canonicalRootPath, normalizedBoundaryPath)
    ) {
      return { normalizedPath, ok: false, reason: 'outside_root' };
    }
  }

  if (!(requireExisting || requireDirectory)) {
    return { normalizedPath, ok: true, resolvedPath };
  }

  try {
    const fileStats = await stat(resolvedPath);
    if (requireDirectory && !fileStats.isDirectory()) {
      return { normalizedPath, ok: false, reason: 'not_directory' };
    }
    return { normalizedPath, ok: true, resolvedPath };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { normalizedPath, ok: false, reason: 'not_found' };
    }
    throw error;
  }
};

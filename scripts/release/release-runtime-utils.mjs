import { readFile } from 'node:fs/promises';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const toErrorMessage = (error) => (error instanceof Error ? error.message : String(error));

export const parseRequiredRunId = (raw) => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid run id '${raw}'. Use a positive integer.`);
  }
  return parsed;
};

export const parseOptionalRunId = (raw) => {
  if (!raw) {
    return null;
  }

  return parseRequiredRunId(raw);
};

export const parseBooleanWithFallback = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n'].includes(normalized)) {
    return false;
  }
  return fallback;
};

export const parsePositiveNumberWithFallback = (raw, fallback) => {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const parsePositiveIntegerWithFallback = (raw, fallback, { allowZero = false } = {}) => {
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  if (allowZero && parsed === 0) {
    return 0;
  }
  return parsed > 0 ? parsed : fallback;
};

const TRANSIENT_FILE_READ_ERROR_CODES = new Set(['EBUSY', 'EPERM']);

export const isTransientFileReadError = (error) =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string' &&
    TRANSIENT_FILE_READ_ERROR_CODES.has(error.code),
  );

export const retryFileReadOperation = async (operation, { delayMs = 50, maxAttempts = 5 } = {}) => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      return await operation();
    } catch (error) {
      if (!isTransientFileReadError(error) || attempts >= maxAttempts) {
        throw error;
      }
      await sleep(delayMs);
    }
  }

  throw new Error('retryFileReadOperation exhausted without executing operation');
};

export const decodeTextWithEncodingFallback = (input) => {
  if (typeof input === 'string') {
    return input.replace(/^\uFEFF/u, '');
  }

  let raw =
    input.length >= 2 && input[0] === 0xff && input[1] === 0xfe
      ? input.toString('utf16le')
      : input.toString('utf8');

  if (raw.includes('\u0000')) {
    raw = input.toString('utf16le');
  }

  return raw.replace(/^\uFEFF/u, '');
};

export const parseJsonWithEncodingFallback = (input) =>
  JSON.parse(decodeTextWithEncodingFallback(input));

export const readJsonFileWithEncodingFallback = async (filePath, options) =>
  parseJsonWithEncodingFallback(await retryFileReadOperation(() => readFile(filePath), options));

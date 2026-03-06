import { readFile } from 'node:fs/promises';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const toErrorMessage = (error) => (error instanceof Error ? error.message : String(error));

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

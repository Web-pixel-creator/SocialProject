import type { Page } from '@playwright/test';

const RETRYABLE_NAVIGATION_ERRORS = [
  'ERR_ABORTED',
  'frame was detached',
] as const;

const isRetryableNavigationError = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : String(error ?? '');

  return RETRYABLE_NAVIGATION_ERRORS.some((fragment) =>
    message.includes(fragment),
  );
};

interface NavigateWithRetryOptions {
  attempts?: number;
  gotoOptions?: Parameters<Page['goto']>[1];
  retryDelayMs?: number;
}

export const navigateWithRetry = async (
  page: Page,
  path: string,
  options: NavigateWithRetryOptions = {},
) => {
  const {
    attempts = 3,
    gotoOptions,
    retryDelayMs = 200,
  } = options;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(path, gotoOptions);
      return;
    } catch (error) {
      if (
        page.isClosed() ||
        attempt === attempts ||
        !isRetryableNavigationError(error)
      ) {
        throw error;
      }

      await page.waitForTimeout(retryDelayMs * attempt);
    }
  }
};

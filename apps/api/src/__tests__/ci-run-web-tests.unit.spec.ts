import { describe, expect, test } from '@jest/globals';

const { DEFAULT_WEB_TEST_PATH, resolveWebJestArgs } =
  require('../../../../scripts/ci/run-web-tests-core.js') as typeof import('../../../../scripts/ci/run-web-tests-core.js');

describe('CI web test runner args', () => {
  test('defaults to the web test subtree when no args are provided', () => {
    expect(resolveWebJestArgs([])).toEqual([DEFAULT_WEB_TEST_PATH]);
  });

  test('keeps the web test subtree when only jest options are passed through', () => {
    expect(resolveWebJestArgs(['--runInBand'])).toEqual([
      '--runInBand',
      DEFAULT_WEB_TEST_PATH,
    ]);
  });

  test('preserves explicit path targets', () => {
    expect(
      resolveWebJestArgs([
        '--runInBand',
        'apps/web/src/__tests__/admin-ux-page.spec.tsx',
      ]),
    ).toEqual(['--runInBand', 'apps/web/src/__tests__/admin-ux-page.spec.tsx']);
  });

  test('preserves explicit runTestsByPath invocations', () => {
    expect(
      resolveWebJestArgs([
        '--runTestsByPath',
        'apps/web/src/__tests__/admin-ux-page.spec.tsx',
        '--runInBand',
      ]),
    ).toEqual([
      '--runTestsByPath',
      'apps/web/src/__tests__/admin-ux-page.spec.tsx',
      '--runInBand',
    ]);
  });
});

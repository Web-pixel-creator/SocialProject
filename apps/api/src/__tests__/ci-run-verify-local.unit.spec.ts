import { describe, expect, test } from '@jest/globals';

const { VERIFY_LOCAL_MODE, resolveVerifyLocalApiStep } =
  require('../../../../scripts/ci/run-verify-local-core.js') as typeof import('../../../../scripts/ci/run-verify-local-core.js');

describe('CI verify-local mode resolver', () => {
  test('reuses running services when both local ports are reachable', () => {
    expect(
      resolveVerifyLocalApiStep({
        portReachability: {
          5432: true,
          6379: true,
        },
      }),
    ).toMatchObject({
      script: 'test:api:skip-deps',
    });
  });

  test('bootstraps services when a required port is unavailable', () => {
    expect(
      resolveVerifyLocalApiStep({
        portReachability: {
          5432: true,
          6379: false,
        },
      }),
    ).toMatchObject({
      script: 'test:api',
    });
  });

  test('honors forced skip-deps mode', () => {
    expect(
      resolveVerifyLocalApiStep({
        mode: VERIFY_LOCAL_MODE.SKIP_DEPS,
        portReachability: {
          5432: false,
          6379: false,
        },
      }),
    ).toMatchObject({
      script: 'test:api:skip-deps',
    });
  });

  test('honors forced bootstrap mode', () => {
    expect(
      resolveVerifyLocalApiStep({
        mode: VERIFY_LOCAL_MODE.BOOTSTRAP_DEPS,
        portReachability: {
          5432: true,
          6379: true,
        },
      }),
    ).toMatchObject({
      script: 'test:api',
    });
  });
});

import {
  getApiErrorCode,
  getApiErrorMessage,
  getApiErrorStatus,
} from '../lib/errors';

describe('api error helpers', () => {
  test('returns status only for finite numeric response status', () => {
    expect(getApiErrorStatus({ response: { status: 404 } })).toBe(404);
    expect(getApiErrorStatus({ response: { status: Number.NaN } })).toBeNull();
    expect(getApiErrorStatus({ response: { status: '404' } })).toBeNull();
    expect(getApiErrorStatus('bad-shape')).toBeNull();
  });

  test('returns code only for non-empty trimmed string value', () => {
    expect(
      getApiErrorCode({ response: { data: { error: 'AUTH_REQUIRED' } } }),
    ).toBe('AUTH_REQUIRED');
    expect(
      getApiErrorCode({ response: { data: { error: '   ' } } }),
    ).toBeNull();
    expect(getApiErrorCode({ response: { data: { error: 401 } } })).toBeNull();
    expect(getApiErrorCode(null)).toBeNull();
  });

  test('prefers response message, then root message, then fallback', () => {
    expect(
      getApiErrorMessage(
        {
          response: {
            data: {
              message: 'Readable API message',
            },
          },
          message: 'Root message',
        },
        'Fallback text',
      ),
    ).toBe('Readable API message');

    expect(
      getApiErrorMessage(
        {
          response: {
            data: {
              message: '',
            },
          },
          message: 'Root message',
        },
        'Fallback text',
      ),
    ).toBe('Root message');

    expect(getApiErrorMessage({ message: '   ' }, 'Fallback text')).toBe(
      'Fallback text',
    );
    expect(getApiErrorMessage(undefined, 'Fallback text')).toBe(
      'Fallback text',
    );
  });
});

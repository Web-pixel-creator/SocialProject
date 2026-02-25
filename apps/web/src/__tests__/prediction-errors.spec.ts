import {
  resolvePredictionLoadErrorMessage,
  resolvePredictionSubmitErrorMessage,
} from '../lib/predictionErrors';

const MESSAGES: Record<string, string> = {
  'prediction.invalidStakeRange': 'Stake must be in range:',
  'prediction.limitStakeCapReached':
    'Daily stake cap reached for current stake.',
  'prediction.limitSubmissionCapReached':
    'Daily prediction submission cap reached.',
  'prediction.noPendingPr': 'No pending PR for prediction.',
  'prediction.rateLimited':
    'Too many prediction requests. Please try again shortly.',
  'prediction.signInRequired': 'Sign in as observer to submit predictions.',
};

const t = (key: string): string => MESSAGES[key] ?? key;

describe('prediction error mapping', () => {
  test('maps auth status to sign-in message', () => {
    const message = resolvePredictionSubmitErrorMessage({
      error: { response: { status: 401 } },
      fallback: 'Fallback prediction error.',
      t,
    });

    expect(message).toBe(MESSAGES['prediction.signInRequired']);
  });

  test('maps stake invalid code to localized stake range message', () => {
    const message = resolvePredictionSubmitErrorMessage({
      error: {
        response: {
          status: 400,
          data: { error: 'PREDICTION_STAKE_INVALID', message: 'raw message' },
        },
      },
      fallback: 'Fallback prediction error.',
      stakeBounds: {
        maxStakePoints: 120,
        minStakePoints: 5,
      },
      t,
    });

    expect(message).toBe('Stake must be in range: 5-120 FIN.');
  });

  test('maps daily submission cap error code', () => {
    const message = resolvePredictionSubmitErrorMessage({
      error: {
        response: {
          status: 409,
          data: {
            error: 'PREDICTION_DAILY_SUBMISSION_CAP_REACHED',
            message: 'raw message',
          },
        },
      },
      fallback: 'Fallback prediction error.',
      t,
    });

    expect(message).toBe(MESSAGES['prediction.limitSubmissionCapReached']);
  });

  test('maps rate-limited status on submit', () => {
    const message = resolvePredictionSubmitErrorMessage({
      error: {
        response: {
          status: 429,
          data: { error: 'RATE_LIMITED', message: 'raw message' },
        },
      },
      fallback: 'Fallback prediction error.',
      t,
    });

    expect(message).toBe(MESSAGES['prediction.rateLimited']);
  });

  test('maps rate-limited status on summary load', () => {
    const message = resolvePredictionLoadErrorMessage({
      error: {
        response: {
          status: 429,
          data: { error: 'RATE_LIMITED', message: 'raw message' },
        },
      },
      fallback: 'Failed to load prediction summary.',
      t,
    });

    expect(message).toBe(MESSAGES['prediction.rateLimited']);
  });

  test('maps daily stake cap error code', () => {
    const message = resolvePredictionSubmitErrorMessage({
      error: {
        response: {
          status: 409,
          data: {
            error: 'PREDICTION_DAILY_STAKE_CAP_REACHED',
            message: 'raw message',
          },
        },
      },
      fallback: 'Fallback prediction error.',
      t,
    });

    expect(message).toBe(MESSAGES['prediction.limitStakeCapReached']);
  });

  test('falls back to API message for unknown codes', () => {
    const message = resolvePredictionSubmitErrorMessage({
      error: {
        response: {
          status: 500,
          data: {
            error: 'UNKNOWN_CODE',
            message: 'Raw backend message.',
          },
        },
      },
      fallback: 'Fallback prediction error.',
      t,
    });

    expect(message).toBe('Raw backend message.');
  });
});

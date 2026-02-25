import {
  getApiErrorCode,
  getApiErrorMessage,
  getApiErrorStatus,
} from './errors';

type Translate = (key: string) => string;

interface PredictionStakeBounds {
  maxStakePoints?: number | null;
  minStakePoints?: number | null;
}

interface ResolvePredictionSubmitErrorMessageOptions {
  error: unknown;
  fallback: string;
  stakeBounds?: PredictionStakeBounds | null;
  t: Translate;
}

interface ResolvePredictionLoadErrorMessageOptions {
  error: unknown;
  fallback: string;
  t: Translate;
}

const getPredictionStakeBounds = (
  stakeBounds?: PredictionStakeBounds | null,
): { maxStakePoints: number; minStakePoints: number } => {
  const minStakePoints = Math.max(
    1,
    Math.round(stakeBounds?.minStakePoints ?? 5),
  );
  const maxStakePoints = Math.max(
    minStakePoints,
    Math.round(stakeBounds?.maxStakePoints ?? 500),
  );
  return { maxStakePoints, minStakePoints };
};

const resolveKnownPredictionErrorMessage = ({
  error,
  stakeBounds,
  t,
}: {
  error: unknown;
  stakeBounds?: PredictionStakeBounds | null;
  t: Translate;
}): string | null => {
  const status = getApiErrorStatus(error);
  if (status === 401 || status === 403) {
    return t('prediction.signInRequired');
  }
  if (status === 429) {
    return t('prediction.rateLimited');
  }

  const code = getApiErrorCode(error);
  if (code === 'PREDICTION_DAILY_SUBMISSION_CAP_REACHED') {
    return t('prediction.limitSubmissionCapReached');
  }
  if (
    code === 'PREDICTION_DAILY_STAKE_CAP_REACHED' ||
    code === 'PREDICTION_STAKE_LIMIT_EXCEEDED'
  ) {
    return t('prediction.limitStakeCapReached');
  }
  if (code === 'PREDICTION_NO_PENDING_PR') {
    return t('prediction.noPendingPr');
  }
  if (code === 'PREDICTION_STAKE_INVALID') {
    const { maxStakePoints, minStakePoints } =
      getPredictionStakeBounds(stakeBounds);
    return `${t('prediction.invalidStakeRange')} ${minStakePoints}-${maxStakePoints} FIN.`;
  }

  return null;
};

export const resolvePredictionSubmitErrorMessage = ({
  error,
  fallback,
  stakeBounds,
  t,
}: ResolvePredictionSubmitErrorMessageOptions): string => {
  const knownMessage = resolveKnownPredictionErrorMessage({
    error,
    stakeBounds,
    t,
  });
  if (knownMessage) {
    return knownMessage;
  }

  return getApiErrorMessage(error, fallback);
};

export const resolvePredictionLoadErrorMessage = ({
  error,
  fallback,
  t,
}: ResolvePredictionLoadErrorMessageOptions): string => {
  const knownMessage = resolveKnownPredictionErrorMessage({ error, t });
  if (knownMessage) {
    return knownMessage;
  }

  return getApiErrorMessage(error, fallback);
};

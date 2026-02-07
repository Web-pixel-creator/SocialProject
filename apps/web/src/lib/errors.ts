interface ApiErrorShape {
  message?: unknown;
  response?: {
    status?: unknown;
    data?: {
      message?: unknown;
      error?: unknown;
    };
  };
}

const toApiErrorShape = (error: unknown): ApiErrorShape | null => {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  return error as ApiErrorShape;
};

export const getApiErrorStatus = (error: unknown): number | null => {
  const candidate = toApiErrorShape(error);
  const status = candidate?.response?.status;
  if (typeof status === 'number' && Number.isFinite(status)) {
    return status;
  }
  return null;
};

export const getApiErrorCode = (error: unknown): string | null => {
  const candidate = toApiErrorShape(error);
  const code = candidate?.response?.data?.error;
  if (typeof code === 'string' && code.trim().length > 0) {
    return code;
  }
  return null;
};

export const getApiErrorMessage = (
  error: unknown,
  fallback: string,
): string => {
  const candidate = toApiErrorShape(error);
  if (!candidate) {
    return fallback;
  }

  const responseMessage = candidate.response?.data?.message;
  if (
    typeof responseMessage === 'string' &&
    responseMessage.trim().length > 0
  ) {
    return responseMessage;
  }

  if (
    typeof candidate.message === 'string' &&
    candidate.message.trim().length > 0
  ) {
    return candidate.message;
  }

  return fallback;
};

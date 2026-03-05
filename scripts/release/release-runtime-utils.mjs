export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const toErrorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

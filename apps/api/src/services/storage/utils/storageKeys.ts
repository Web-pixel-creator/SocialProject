import crypto from 'crypto';

export const createStorageKey = (draftId: string, versionNumber: number, extension = 'png') => {
  const suffix = crypto.randomBytes(6).toString('hex');
  return `drafts/${draftId}/v${versionNumber}-${suffix}.${extension}`;
};

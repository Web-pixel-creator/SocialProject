import { createHash } from 'node:crypto';

type DraftMetadata = Record<string, unknown>;

export const buildEmbeddingSignal = (
  imageUrl?: string,
  metadata?: DraftMetadata,
): string => {
  const parts: string[] = [];
  if (typeof imageUrl === 'string' && imageUrl.trim()) {
    parts.push(imageUrl.trim());
  }
  const title = metadata?.title;
  if (typeof title === 'string' && title.trim()) {
    parts.push(title.trim());
  }
  const tagsValue = metadata?.tags;
  if (Array.isArray(tagsValue)) {
    const tags = tagsValue.map((tag) => String(tag).trim()).filter(Boolean);
    if (tags.length > 0) {
      parts.push(tags.join(','));
    }
  }
  return parts.join('|');
};

export const generateEmbedding = (
  signal: string,
  dimensions = 12,
): number[] => {
  if (!signal) {
    return [];
  }
  const hash = createHash('sha256').update(signal).digest();
  const vector: number[] = [];
  for (let i = 0; i < dimensions; i += 1) {
    const byte = hash[i % hash.length];
    vector.push(Number((byte / 255).toFixed(4)));
  }
  return vector;
};

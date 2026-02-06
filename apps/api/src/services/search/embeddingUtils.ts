import { createHash } from 'node:crypto';

type DraftMetadata = Record<string, any>;

export const buildEmbeddingSignal = (
  imageUrl?: string,
  metadata?: DraftMetadata,
): string => {
  const parts: string[] = [];
  if (typeof imageUrl === 'string' && imageUrl.trim()) {
    parts.push(imageUrl.trim());
  }
  if (metadata && typeof metadata.title === 'string' && metadata.title.trim()) {
    parts.push(metadata.title.trim());
  }
  if (Array.isArray(metadata?.tags)) {
    const tags = metadata.tags
      .map((tag: string) => String(tag).trim())
      .filter(Boolean);
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

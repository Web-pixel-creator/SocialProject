import { env } from '../config/env';
import { EmbeddingServiceImpl } from '../services/search/embeddingService';

const originalEnv = {
  EMBEDDING_PROVIDER: env.EMBEDDING_PROVIDER,
  EMBEDDING_API_KEY: env.EMBEDDING_API_KEY,
  EMBEDDING_API_URL: env.EMBEDDING_API_URL,
  EMBEDDING_DIMENSIONS: env.EMBEDDING_DIMENSIONS
};

const restoreEnv = () => {
  env.EMBEDDING_PROVIDER = originalEnv.EMBEDDING_PROVIDER;
  env.EMBEDDING_API_KEY = originalEnv.EMBEDDING_API_KEY;
  env.EMBEDDING_API_URL = originalEnv.EMBEDDING_API_URL;
  env.EMBEDDING_DIMENSIONS = originalEnv.EMBEDDING_DIMENSIONS;
};

describe('EmbeddingService', () => {
  beforeEach(() => {
    restoreEnv();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    restoreEnv();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).fetch;
  });

  test('returns null when no signal is available', async () => {
    env.EMBEDDING_PROVIDER = 'hash';
    env.EMBEDDING_DIMENSIONS = 8;

    const service = new EmbeddingServiceImpl();
    const result = await service.generateEmbedding({ metadata: {} });

    expect(result).toBeNull();
  });

  test('generates deterministic hash embedding when provider is hash', async () => {
    env.EMBEDDING_PROVIDER = 'hash';
    env.EMBEDDING_DIMENSIONS = 8;

    const service = new EmbeddingServiceImpl();
    const result = await service.generateEmbedding({
      imageUrl: 'https://example.com/image.png',
      metadata: { title: 'Test' }
    });

    expect(result).toHaveLength(8);
    result?.forEach((value) => {
      expect(typeof value).toBe('number');
    });
  });

  test('uses remote embeddings when provider succeeds', async () => {
    env.EMBEDDING_PROVIDER = 'jina';
    env.EMBEDDING_API_KEY = 'test-key';
    env.EMBEDDING_DIMENSIONS = 8;

    const remoteEmbedding = [0.1, 0.2, 0.3];
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: remoteEmbedding }] })
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;

    const service = new EmbeddingServiceImpl();
    const result = await service.generateEmbedding({
      imageUrl: 'https://example.com/image.png',
      metadata: { title: 'Remote' }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(remoteEmbedding);
  });

  test('falls back to hash when remote provider fails', async () => {
    env.EMBEDDING_PROVIDER = 'jina';
    env.EMBEDDING_API_KEY = 'test-key';
    env.EMBEDDING_DIMENSIONS = 8;

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({})
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;

    const service = new EmbeddingServiceImpl();
    const result = await service.generateEmbedding({
      imageUrl: 'https://example.com/image.png',
      metadata: { title: 'Fallback' }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(8);
  });
});

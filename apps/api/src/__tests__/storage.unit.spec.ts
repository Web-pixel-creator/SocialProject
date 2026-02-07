jest.mock('../storage/s3', () => ({
  s3: {
    send: jest.fn(),
  },
  S3_BUCKET: 'test-bucket',
}));

jest.mock('../config/env', () => ({
  env: {
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'test-bucket',
  },
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('sharp', () => {
  return () => ({
    resize: () => ({
      png: () => ({
        toBuffer: async () => Buffer.from('thumb'),
      }),
    }),
  });
});

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { StorageServiceImpl } from '../services/storage/storageService';
import { createStorageKey } from '../services/storage/utils/storageKeys';
import { s3 } from '../storage/s3';

describe('storage service edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('unique storage key per version', () => {
    const draftId = 'draft-123';
    const keyOne = createStorageKey(draftId, 1);
    const keyTwo = createStorageKey(draftId, 1);

    expect(keyOne).not.toEqual(keyTwo);
    expect(keyOne).toContain(`drafts/${draftId}/v1-`);
  });

  test('uploads images and thumbnails and returns urls', async () => {
    const sendMock = s3.send as jest.Mock;
    sendMock.mockResolvedValue({});

    const service = new StorageServiceImpl();
    const result = await service.uploadVersion({
      draftId: 'draft-1',
      versionNumber: 1,
      imageBuffer: Buffer.from('image'),
      contentType: 'image/png',
    });

    expect(result.key).toContain('drafts/draft-1/v1-');
    expect(result.url).toContain(env.S3_ENDPOINT);
    expect(result.thumbnailUrl).toContain(env.S3_ENDPOINT);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  test('uploads jpg versions when content type is not png', async () => {
    const sendMock = s3.send as jest.Mock;
    sendMock.mockResolvedValue({});

    const service = new StorageServiceImpl();
    const result = await service.uploadVersion({
      draftId: 'draft-2',
      versionNumber: 2,
      imageBuffer: Buffer.from('image'),
      contentType: 'image/jpeg',
    });

    expect(result.key).toMatch(/\.jpg$/);
    const firstCall = sendMock.mock.calls[0][0] as {
      input?: { Key?: string; ContentType?: string };
    };
    expect(firstCall?.input?.Key).toBe(result.key);
    expect(firstCall?.input?.ContentType).toBe('image/jpeg');
  });

  test('generates signed url with provided expiry', async () => {
    const signed = 'https://signed.example.com';
    (getSignedUrl as jest.Mock).mockResolvedValue(signed);

    const service = new StorageServiceImpl();
    const result = await service.generateSignedUrl('drafts/key.png', 120);

    expect(result).toBe(signed);
    expect(getSignedUrl).toHaveBeenCalledWith(
      s3,
      expect.any(GetObjectCommand),
      { expiresIn: 120 },
    );
  });

  test('deleteObject forwards delete command', async () => {
    const sendMock = s3.send as jest.Mock;
    sendMock.mockResolvedValue({});

    const service = new StorageServiceImpl();
    await service.deleteObject('drafts/key.png');

    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

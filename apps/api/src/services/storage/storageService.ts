import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import { env } from '../../config/env';
import { s3, S3_BUCKET } from '../../storage/s3';
import { createStorageKey } from './utils/storageKeys';
import type { StorageService, StorageUploadResult } from './types';

const THUMBNAIL_WIDTH = 480;

const buildPublicUrl = (key: string) => `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}`;

export class StorageServiceImpl implements StorageService {
  async uploadVersion(params: {
    draftId: string;
    versionNumber: number;
    imageBuffer: Buffer;
    contentType: string;
  }): Promise<StorageUploadResult> {
    const { draftId, versionNumber, imageBuffer, contentType } = params;
    const key = createStorageKey(draftId, versionNumber, contentType.includes('png') ? 'png' : 'jpg');
    const thumbnailKey = createStorageKey(draftId, versionNumber, 'thumb.png');

    const thumbnailBuffer = await sharp(imageBuffer)
      .resize({ width: THUMBNAIL_WIDTH })
      .png()
      .toBuffer();

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: imageBuffer,
        ContentType: contentType
      })
    );

    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/png'
      })
    );

    return {
      key,
      url: buildPublicUrl(key),
      thumbnailUrl: buildPublicUrl(thumbnailKey)
    };
  }

  async generateSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    });

    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject(key: string): Promise<void> {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key
      })
    );
  }
}

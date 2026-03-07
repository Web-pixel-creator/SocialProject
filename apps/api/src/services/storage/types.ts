export interface StorageUploadResult {
  key: string;
  url: string;
  thumbnailUrl: string;
}

export interface StorageObjectUploadResult {
  key: string;
  url: string;
}

export interface StorageService {
  uploadVersion(params: {
    draftId: string;
    versionNumber: number;
    imageBuffer: Buffer;
    contentType: string;
  }): Promise<StorageUploadResult>;
  uploadObject(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<StorageObjectUploadResult>;
  generateSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

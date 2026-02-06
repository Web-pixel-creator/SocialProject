export interface StorageUploadResult {
  key: string;
  url: string;
  thumbnailUrl: string;
}

export interface StorageService {
  uploadVersion(params: {
    draftId: string;
    versionNumber: number;
    imageBuffer: Buffer;
    contentType: string;
  }): Promise<StorageUploadResult>;
  generateSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  deleteObject(key: string): Promise<void>;
}

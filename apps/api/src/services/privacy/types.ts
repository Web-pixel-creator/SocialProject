import type { DbClient } from '../auth/types';

export type DataExportStatus = 'pending' | 'ready' | 'failed';
export type DeletionStatus = 'pending' | 'completed' | 'failed';

export interface DataExport {
  id: string;
  userId: string;
  status: DataExportStatus;
  downloadUrl?: string | null;
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface ExportBundle {
  manifest: {
    exportId: string;
    generatedAt: string;
    expiresAt: string;
  };
  profile: Record<string, unknown>;
  viewingHistory: Record<string, unknown>[];
  commissions: Record<string, unknown>[];
}

export interface DeletionRequest {
  id: string;
  userId: string;
  status: DeletionStatus;
  requestedAt: Date;
  completedAt?: Date | null;
}

export interface CleanupCounts extends Record<string, number> {
  viewingHistory: number;
  paymentEvents: number;
  dataExports: number;
}

export interface PrivacyService {
  requestExport(
    userId: string,
    client?: DbClient,
  ): Promise<{ export: DataExport; bundle: ExportBundle }>;
  getExportStatus(exportId: string, client?: DbClient): Promise<DataExport>;
  requestDeletion(userId: string, client?: DbClient): Promise<DeletionRequest>;
  previewExpiredData(client?: DbClient): Promise<CleanupCounts>;
  purgeExpiredData(client?: DbClient): Promise<CleanupCounts>;
}

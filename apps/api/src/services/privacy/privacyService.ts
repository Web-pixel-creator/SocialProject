import type { Pool } from 'pg';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import {
  DATA_EXPORTS_TTL_DAYS,
  EXPORT_RATE_LIMIT_HOURS,
  EXPORT_URL_TTL_HOURS,
  PAYMENT_EVENTS_TTL_DAYS,
  VIEWING_HISTORY_TTL_DAYS,
} from './constants';
import type {
  CleanupCounts,
  DataExport,
  DeletionRequest,
  ExportBundle,
  PrivacyService,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

interface DataExportRow {
  id: string;
  user_id: string;
  status: DataExport['status'];
  export_url: string | null;
  expires_at: Date;
  created_at: Date;
}

interface DeletionRow {
  id: string;
  user_id: string;
  status: DeletionRequest['status'];
  requested_at: Date;
  completed_at: Date | null;
}

const mapExport = (row: DataExportRow): DataExport => ({
  id: row.id,
  userId: row.user_id,
  status: row.status,
  downloadUrl: row.export_url,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

const mapDeletion = (row: DeletionRow): DeletionRequest => ({
  id: row.id,
  userId: row.user_id,
  status: row.status,
  requestedAt: row.requested_at,
  completedAt: row.completed_at,
});

const buildExportUrl = (exportId: string) =>
  `https://example.com/exports/${exportId}.zip`;

export class PrivacyServiceImpl implements PrivacyService {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async requestExport(
    userId: string,
    client?: DbClient,
  ): Promise<{ export: DataExport; bundle: ExportBundle }> {
    const db = getDb(this.pool, client);

    const recent = await db.query(
      `SELECT id FROM data_exports
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${EXPORT_RATE_LIMIT_HOURS} hours'`,
      [userId],
    );

    if (recent.rows.length > 0) {
      throw new ServiceError(
        'EXPORT_RATE_LIMIT',
        'Export rate limit exceeded.',
      );
    }

    const exportRow = await db.query(
      `INSERT INTO data_exports (user_id, status, export_url, expires_at)
       VALUES ($1, 'ready', $2, NOW() + INTERVAL '${EXPORT_URL_TTL_HOURS} hours') RETURNING *`,
      [userId, buildExportUrl('pending')],
    );

    const exportId = exportRow.rows[0].id;
    const url = buildExportUrl(exportId);

    const updated = await db.query(
      'UPDATE data_exports SET export_url = $1 WHERE id = $2 RETURNING *',
      [url, exportId],
    );

    const profile = await db.query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [userId],
    );
    const viewingHistory = await db.query(
      `SELECT draft_id, viewed_at FROM viewing_history
       WHERE user_id = $1 AND viewed_at > NOW() - INTERVAL '${VIEWING_HISTORY_TTL_DAYS} days'`,
      [userId],
    );
    const commissions = await db.query(
      'SELECT id, status, reward_amount FROM commissions WHERE user_id = $1',
      [userId],
    );

    const expiresAt = updated.rows[0].expires_at as Date;
    const bundle: ExportBundle = {
      manifest: {
        exportId,
        generatedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
      profile: profile.rows[0] ?? {},
      viewingHistory: viewingHistory.rows,
      commissions: commissions.rows,
    };

    return {
      export: mapExport(updated.rows[0] as DataExportRow),
      bundle,
    };
  }

  async getExportStatus(
    exportId: string,
    client?: DbClient,
  ): Promise<DataExport> {
    const db = getDb(this.pool, client);
    const result = await db.query('SELECT * FROM data_exports WHERE id = $1', [
      exportId,
    ]);

    if (result.rows.length === 0) {
      throw new ServiceError('EXPORT_NOT_FOUND', 'Export not found.', 404);
    }

    return mapExport(result.rows[0] as DataExportRow);
  }

  async requestDeletion(
    userId: string,
    client?: DbClient,
  ): Promise<DeletionRequest> {
    const db = getDb(this.pool, client);

    const pending = await db.query(
      "SELECT id FROM deletion_requests WHERE user_id = $1 AND status = 'pending'",
      [userId],
    );

    if (pending.rows.length > 0) {
      throw new ServiceError(
        'DELETION_PENDING',
        'Deletion request already pending.',
      );
    }

    const deletion = await db.query(
      "INSERT INTO deletion_requests (user_id, status) VALUES ($1, 'pending') RETURNING *",
      [userId],
    );

    const anonymizedEmail = `deleted-${userId}@example.com`;
    await db.query(
      'UPDATE users SET email = $1, oauth_provider = NULL, oauth_id = NULL, deleted_at = NOW(), anonymized_at = NOW() WHERE id = $2',
      [anonymizedEmail, userId],
    );

    const completed = await db.query(
      "UPDATE deletion_requests SET status = 'completed', completed_at = NOW() WHERE id = $1 RETURNING *",
      [deletion.rows[0].id],
    );

    return mapDeletion(completed.rows[0] as DeletionRow);
  }

  async previewExpiredData(client?: DbClient): Promise<CleanupCounts> {
    const db = getDb(this.pool, client);
    const viewing = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM viewing_history
       WHERE viewed_at < NOW() - INTERVAL '${VIEWING_HISTORY_TTL_DAYS} days'`,
    );
    const payments = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM payment_events
       WHERE received_at < NOW() - INTERVAL '${PAYMENT_EVENTS_TTL_DAYS} days'`,
    );
    const exports = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM data_exports
       WHERE created_at < NOW() - INTERVAL '${DATA_EXPORTS_TTL_DAYS} days'`,
    );

    return {
      viewingHistory: Number(viewing.rows[0]?.count ?? 0),
      paymentEvents: Number(payments.rows[0]?.count ?? 0),
      dataExports: Number(exports.rows[0]?.count ?? 0),
    };
  }

  async purgeExpiredData(client?: DbClient): Promise<CleanupCounts> {
    const db = getDb(this.pool, client);
    const viewing = await db.query(
      `DELETE FROM viewing_history
       WHERE viewed_at < NOW() - INTERVAL '${VIEWING_HISTORY_TTL_DAYS} days'
       RETURNING id`,
    );
    const payments = await db.query(
      `DELETE FROM payment_events
       WHERE received_at < NOW() - INTERVAL '${PAYMENT_EVENTS_TTL_DAYS} days'
       RETURNING id`,
    );
    const exports = await db.query(
      `DELETE FROM data_exports
       WHERE created_at < NOW() - INTERVAL '${DATA_EXPORTS_TTL_DAYS} days'
       RETURNING id`,
    );

    return {
      viewingHistory: viewing.rowCount ?? viewing.rows.length,
      paymentEvents: payments.rowCount ?? payments.rows.length,
      dataExports: exports.rowCount ?? exports.rows.length,
    };
  }
}

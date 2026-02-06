import type { Pool } from 'pg';
import { logger } from '../../logging/logger';
import type { DbClient } from '../auth/types';
import { ServiceError } from '../common/errors';
import type {
  NotificationDelivery,
  NotificationPayload,
  NotificationService,
} from './types';

const getDb = (pool: Pool, client?: DbClient): DbClient => client ?? pool;

const defaultDelivery: NotificationDelivery = async (
  url: string,
  payload: NotificationPayload,
) => {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
};

const getPrefs = (prefs: any) => {
  if (!prefs) {
    return {};
  }
  if (typeof prefs === 'string') {
    try {
      return JSON.parse(prefs);
    } catch {
      return {};
    }
  }
  return prefs;
};

export class NotificationServiceImpl implements NotificationService {
  private readonly pool: Pool;
  private readonly delivery: NotificationDelivery;

  constructor(pool: Pool, delivery: NotificationDelivery = defaultDelivery) {
    this.pool = pool;
    this.delivery = delivery;
  }

  async notifyAuthorOnPullRequest(
    draftId: string,
    pullRequestId: string,
    client?: DbClient,
  ): Promise<void> {
    const db = getDb(this.pool, client);
    const author = await db.query(
      `SELECT a.webhook_url, a.notification_prefs
       FROM drafts d
       JOIN agents a ON d.author_id = a.id
       WHERE d.id = $1`,
      [draftId],
    );

    if (author.rows.length === 0) {
      throw new ServiceError('AUTHOR_NOT_FOUND', 'Author not found.', 404);
    }

    const { webhook_url, notification_prefs } = author.rows[0];
    const prefs = getPrefs(notification_prefs);
    if (!webhook_url || prefs.enablePullRequests === false) {
      return;
    }

    const payload: NotificationPayload = {
      type: 'pull_request_submitted',
      data: { draftId, pullRequestId },
    };

    try {
      logger.info(
        { draftId, pullRequestId },
        'Webhook delivery: pull_request_submitted',
      );
      await this.delivery(webhook_url, payload);
    } catch (error) {
      logger.error(
        { err: error, draftId, pullRequestId },
        'Webhook delivery failed',
      );
      throw error;
    }
  }

  async notifyAuthorOnFixRequest(
    draftId: string,
    fixRequestId: string,
    client?: DbClient,
  ): Promise<void> {
    const db = getDb(this.pool, client);
    const author = await db.query(
      `SELECT a.webhook_url, a.notification_prefs
       FROM drafts d
       JOIN agents a ON d.author_id = a.id
       WHERE d.id = $1`,
      [draftId],
    );

    if (author.rows.length === 0) {
      throw new ServiceError('AUTHOR_NOT_FOUND', 'Author not found.', 404);
    }

    const { webhook_url, notification_prefs } = author.rows[0];
    const prefs = getPrefs(notification_prefs);
    if (!webhook_url || prefs.enableFixRequests === false) {
      return;
    }

    const payload: NotificationPayload = {
      type: 'fix_request_submitted',
      data: { draftId, fixRequestId },
    };

    try {
      logger.info(
        { draftId, fixRequestId },
        'Webhook delivery: fix_request_submitted',
      );
      await this.delivery(webhook_url, payload);
    } catch (error) {
      logger.error(
        { err: error, draftId, fixRequestId },
        'Webhook delivery failed',
      );
      throw error;
    }
  }

  async notifyMakerOnDecision(
    pullRequestId: string,
    decision: string,
    client?: DbClient,
  ): Promise<void> {
    const db = getDb(this.pool, client);
    const maker = await db.query(
      `SELECT a.webhook_url, a.notification_prefs, pr.draft_id
       FROM pull_requests pr
       JOIN agents a ON pr.maker_id = a.id
       WHERE pr.id = $1`,
      [pullRequestId],
    );

    if (maker.rows.length === 0) {
      throw new ServiceError('MAKER_NOT_FOUND', 'Maker not found.', 404);
    }

    const { webhook_url, notification_prefs, draft_id } = maker.rows[0];
    const prefs = getPrefs(notification_prefs);
    if (!webhook_url || prefs.enableDecisions === false) {
      return;
    }

    const payload: NotificationPayload = {
      type: 'pull_request_decision',
      data: { draftId: draft_id, pullRequestId, decision },
    };

    try {
      logger.info(
        { pullRequestId, decision },
        'Webhook delivery: pull_request_decision',
      );
      await this.delivery(webhook_url, payload);
    } catch (error) {
      logger.error(
        { err: error, pullRequestId, decision },
        'Webhook delivery failed',
      );
      throw error;
    }
  }
}

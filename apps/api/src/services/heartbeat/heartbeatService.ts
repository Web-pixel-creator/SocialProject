import type { DbClient } from '../../db/pool';
import { db } from '../../db/pool';
import { ServiceError } from '../common/errors';
import type { HeartbeatPayload, HeartbeatRecord, HeartbeatService, HeartbeatStatus } from './types';

const ACTIVE_WINDOW_MINUTES = 240;

const toHeartbeatRecord = (row: any, now = new Date()): HeartbeatRecord => {
  const lastHeartbeatAt = row.last_heartbeat_at ? new Date(row.last_heartbeat_at) : null;
  const isActive =
    lastHeartbeatAt != null &&
    now.getTime() - lastHeartbeatAt.getTime() <= ACTIVE_WINDOW_MINUTES * 60 * 1000;

  return {
    agentId: row.id,
    lastHeartbeatAt: lastHeartbeatAt?.toISOString() ?? null,
    status: (row.heartbeat_status ?? 'idle') as HeartbeatStatus,
    message: row.heartbeat_message ?? null,
    isActive
  };
};

export class HeartbeatServiceImpl implements HeartbeatService {
  async recordHeartbeat(
    agentId: string,
    payload: HeartbeatPayload = {},
    client: DbClient = db
  ): Promise<HeartbeatRecord> {
    const status = payload.status ?? 'active';
    const message = payload.message ? payload.message.slice(0, 280) : null;

    const result = await client.query(
      `UPDATE agents
       SET last_heartbeat_at = NOW(),
           heartbeat_status = $2,
           heartbeat_message = $3
       WHERE id = $1
       RETURNING id, last_heartbeat_at, heartbeat_status, heartbeat_message`,
      [agentId, status, message]
    );

    if (result.rows.length === 0) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    return toHeartbeatRecord(result.rows[0]);
  }

  async getHeartbeat(agentId: string, client: DbClient = db): Promise<HeartbeatRecord> {
    const result = await client.query(
      'SELECT id, last_heartbeat_at, heartbeat_status, heartbeat_message FROM agents WHERE id = $1',
      [agentId]
    );

    if (result.rows.length === 0) {
      throw new ServiceError('AGENT_NOT_FOUND', 'Agent not found.', 404);
    }

    return toHeartbeatRecord(result.rows[0]);
  }
}

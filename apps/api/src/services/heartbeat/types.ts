import type { DbClient } from '../auth/types';

export type HeartbeatStatus = 'active' | 'idle' | 'away';

export type HeartbeatPayload = {
  status?: HeartbeatStatus;
  message?: string;
};

export type HeartbeatRecord = {
  agentId: string;
  lastHeartbeatAt: string | null;
  status: HeartbeatStatus;
  message: string | null;
  isActive: boolean;
};

export interface HeartbeatService {
  recordHeartbeat(
    agentId: string,
    payload?: HeartbeatPayload,
    client?: DbClient,
  ): Promise<HeartbeatRecord>;
  getHeartbeat(agentId: string, client?: DbClient): Promise<HeartbeatRecord>;
}

import type { DbClient } from '../auth/types';

export type CommissionStatus = 'open' | 'completed' | 'cancelled';
export type PaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'escrowed'
  | 'paid_out'
  | 'refunded'
  | 'failed';

export interface CommissionInput {
  userId: string;
  description: string;
  referenceImages?: string[];
  rewardAmount?: number;
  currency?: string;
}

export interface Commission {
  id: string;
  userId: string;
  description: string;
  referenceImages: string[];
  rewardAmount?: number | null;
  currency: string | null;
  paymentStatus: PaymentStatus;
  status: CommissionStatus;
  winnerDraftId?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
  escrowedAt?: Date | null;
}

export interface CommissionResponseItem {
  id: string;
  commissionId: string;
  draftId: string;
  draftTitle: string | null;
  studioId: string;
  studioName: string;
  createdAt: Date;
}

export interface CommissionFilters {
  status?: CommissionStatus;
  forAgents?: boolean;
}

export interface CommissionService {
  createCommission(
    input: CommissionInput,
    client?: DbClient,
  ): Promise<Commission>;
  getCommissionById(
    commissionId: string,
    client?: DbClient,
  ): Promise<Commission | null>;
  listCommissions(
    filters: CommissionFilters,
    client?: DbClient,
  ): Promise<Commission[]>;
  listCommissionResponses(
    commissionId: string,
    client?: DbClient,
  ): Promise<CommissionResponseItem[]>;
  submitResponse(
    commissionId: string,
    draftId: string,
    agentId: string,
    client?: DbClient,
  ): Promise<void>;
  selectWinner(
    commissionId: string,
    winnerDraftId: string,
    userId: string,
    client?: DbClient,
  ): Promise<Commission>;
  cancelCommission(
    commissionId: string,
    userId: string,
    client?: DbClient,
  ): Promise<Commission>;
  markEscrowed(commissionId: string, client?: DbClient): Promise<Commission>;
}

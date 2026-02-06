import type { DbClient } from '../auth/types';

export type CommissionStatus = 'open' | 'completed' | 'cancelled';
export type PaymentStatus =
  | 'unpaid'
  | 'pending'
  | 'escrowed'
  | 'paid_out'
  | 'refunded'
  | 'failed';

export type CommissionInput = {
  userId: string;
  description: string;
  referenceImages?: string[];
  rewardAmount?: number;
  currency?: string;
};

export type Commission = {
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
};

export type CommissionFilters = {
  status?: CommissionStatus;
  forAgents?: boolean;
};

export type CommissionService = {
  createCommission(
    input: CommissionInput,
    client?: DbClient,
  ): Promise<Commission>;
  listCommissions(
    filters: CommissionFilters,
    client?: DbClient,
  ): Promise<Commission[]>;
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
};

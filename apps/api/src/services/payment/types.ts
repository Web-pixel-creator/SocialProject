import type { DbClient } from '../auth/types';

export type PaymentEventInput = {
  provider: string;
  providerEventId: string;
  commissionId?: string;
  eventType: string;
};

export type PaymentService = {
  createPaymentIntent(commissionId: string, client?: DbClient): Promise<{ paymentIntentId: string }>;
  markEscrowed(commissionId: string, client?: DbClient): Promise<void>;
  payoutWinner(commissionId: string, client?: DbClient): Promise<void>;
  refundCommission(commissionId: string, client?: DbClient): Promise<void>;
  recordWebhookEvent(input: PaymentEventInput, client?: DbClient): Promise<boolean>;
};

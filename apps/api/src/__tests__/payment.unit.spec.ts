import { Pool } from 'pg';
import { PaymentServiceImpl } from '../services/payment/paymentService';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/finishit',
});

describe('payment service unit', () => {
  const missingCommissionId = '00000000-0000-0000-0000-000000000000';

  afterAll(async () => {
    await pool.end();
  });

  test('createPaymentIntent throws for missing commission', async () => {
    const service = new PaymentServiceImpl(pool);
    await expect(
      service.createPaymentIntent(missingCommissionId),
    ).rejects.toThrow(/Commission not found/);
  });

  test('markEscrowed throws for missing commission', async () => {
    const service = new PaymentServiceImpl(pool);
    await expect(service.markEscrowed(missingCommissionId)).rejects.toThrow(
      /Commission not found/,
    );
  });

  test('payoutWinner throws for missing commission', async () => {
    const service = new PaymentServiceImpl(pool);
    await expect(service.payoutWinner(missingCommissionId)).rejects.toThrow(
      /Commission not found/,
    );
  });

  test('refundCommission throws for missing commission', async () => {
    const service = new PaymentServiceImpl(pool);
    await expect(service.refundCommission(missingCommissionId)).rejects.toThrow(
      /Commission not found/,
    );
  });
});

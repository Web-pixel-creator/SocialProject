import type { Pool } from 'pg';
import { PrivacyServiceImpl } from '../services/privacy/privacyService';

const service = new PrivacyServiceImpl({} as Pool);

describe('privacy service edge cases', () => {
  test('rejects export requests when rate limit is exceeded', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [{ id: 'export-1' }] })),
    } as any;

    await expect(service.requestExport('user-1', client)).rejects.toMatchObject(
      {
        code: 'EXPORT_RATE_LIMIT',
      },
    );
  });

  test('builds export bundle with profile fallback', async () => {
    const expiresAt = new Date('2026-01-01T01:00:00.000Z');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'export-1',
              user_id: 'user-1',
              status: 'ready',
              export_url: 'pending',
              expires_at: expiresAt,
              created_at: createdAt,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'export-1',
              user_id: 'user-1',
              status: 'ready',
              export_url: 'https://example.com/exports/export-1.zip',
              expires_at: expiresAt,
              created_at: createdAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{ draft_id: 'draft-1', viewed_at: createdAt }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'commission-1', status: 'open', reward_amount: 10 }],
        }),
    } as any;

    const result = await service.requestExport('user-1', client);

    expect(result.export.userId).toBe('user-1');
    expect(result.export.downloadUrl).toContain('export-1');
    expect(result.bundle.profile).toEqual({});
    expect(result.bundle.viewingHistory).toHaveLength(1);
    expect(result.bundle.commissions).toHaveLength(1);
    expect(result.bundle.manifest.exportId).toBe('export-1');
  });

  test('getExportStatus throws when export missing', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [] })),
    } as any;

    await expect(
      service.getExportStatus('missing', client),
    ).rejects.toMatchObject({
      code: 'EXPORT_NOT_FOUND',
    });
  });

  test('rejects deletion requests when another is pending', async () => {
    const client = {
      query: jest.fn(async () => ({ rows: [{ id: 'pending-1' }] })),
    } as any;

    await expect(
      service.requestDeletion('user-1', client),
    ).rejects.toMatchObject({
      code: 'DELETION_PENDING',
    });
  });

  test('completes deletion and anonymizes user', async () => {
    const requestedAt = new Date('2026-01-01T00:00:00.000Z');
    const completedAt = new Date('2026-01-01T00:10:00.000Z');
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'del-1',
              user_id: 'user-1',
              status: 'pending',
              requested_at: requestedAt,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'del-1',
              user_id: 'user-1',
              status: 'completed',
              requested_at: requestedAt,
              completed_at: completedAt,
            },
          ],
        }),
    } as any;

    const result = await service.requestDeletion('user-1', client);

    expect(result.status).toBe('completed');
    expect(result.userId).toBe('user-1');
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET email'),
      ['deleted-user-1@example.com', 'user-1'],
    );
  });

  test('purgeExpiredData removes old records', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rowCount: 2 })
        .mockResolvedValueOnce({ rowCount: 3 })
        .mockResolvedValueOnce({ rowCount: 1 }),
    } as any;

    const result = await service.purgeExpiredData(client);

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(client.query.mock.calls[0][0]).toContain('viewing_history');
    expect(client.query.mock.calls[1][0]).toContain('payment_events');
    expect(client.query.mock.calls[2][0]).toContain('data_exports');
    expect(result).toEqual({
      viewingHistory: 2,
      paymentEvents: 3,
      dataExports: 1,
    });
  });

  test('previewExpiredData returns counts', async () => {
    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ count: 2 }] })
        .mockResolvedValueOnce({ rows: [{ count: 4 }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] }),
    } as any;

    const result = await service.previewExpiredData(client);

    expect(client.query).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      viewingHistory: 2,
      paymentEvents: 4,
      dataExports: 1,
    });
  });
});

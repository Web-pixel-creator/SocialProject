import { errorHandler } from '../middleware/error';
import { ServiceError } from '../services/common/errors';
import { db } from '../db/pool';

jest.mock('../db/pool', () => ({
  db: {
    query: jest.fn().mockResolvedValue({ rows: [] })
  }
}));

describe('error middleware', () => {
  test('returns 500 for unhandled errors', () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    errorHandler(new Error('boom'), {} as any, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: 'INTERNAL_ERROR',
      message: 'boom'
    });
  });

  test('records error events for service errors', async () => {
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const req: any = {
      originalUrl: '/api/test',
      method: 'POST',
      auth: { role: 'agent', id: 'agent-1' }
    };

    errorHandler(new ServiceError('TEST_ERROR', 'test error', 400), req, res, jest.fn());

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(db.query).toHaveBeenCalled();
  });
});

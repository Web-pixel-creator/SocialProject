import { errorHandler } from '../middleware/error';

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
});

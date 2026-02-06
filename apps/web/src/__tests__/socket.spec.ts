import { io } from 'socket.io-client';
import { getSocket } from '../lib/socket';

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({ id: 'socket-1' })),
}));

describe('socket client', () => {
  test('creates singleton socket with websocket transport', () => {
    const first = getSocket();
    const second = getSocket();

    expect(first).toBe(second);
    expect(io).toHaveBeenCalledTimes(1);
    expect(io).toHaveBeenCalledWith('ws://localhost:4000', {
      transports: ['websocket'],
    });
  });
});

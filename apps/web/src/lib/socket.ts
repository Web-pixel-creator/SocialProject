import { io, type Socket } from 'socket.io-client';
import { WS_BASE_URL } from './config';

let socket: Socket | null = null;

type SocketLike = Pick<Socket, 'emit' | 'on' | 'off'>;

declare global {
  interface Window {
    __finishitSocketMock?: SocketLike;
  }
}

export const getSocket = (): SocketLike => {
  if (typeof window !== 'undefined' && window.__finishitSocketMock) {
    return window.__finishitSocketMock;
  }

  if (!socket) {
    socket = io(WS_BASE_URL, {
      transports: ['websocket'],
    });
  }
  return socket;
};

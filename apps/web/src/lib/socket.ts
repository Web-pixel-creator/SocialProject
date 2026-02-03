import { io, type Socket } from 'socket.io-client';
import { WS_BASE_URL } from './config';

let socket: Socket | null = null;

export const getSocket = () => {
  if (!socket) {
    socket = io(WS_BASE_URL, {
      transports: ['websocket']
    });
  }
  return socket;
};

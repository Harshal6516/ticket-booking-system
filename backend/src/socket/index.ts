import { Server as SocketIOServer } from 'socket.io';

let io: SocketIOServer | null = null;

export function setIO(socketIO: SocketIOServer): void {
  io = socketIO;
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.io not initialized. Call setIO() first.');
  }
  return io;
}

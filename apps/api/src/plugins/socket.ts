// ============================================================
// POS Yoga — Socket.IO Plugin
// ============================================================

import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@pos-yoga/types';

export async function socketPlugin(app: FastifyInstance) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('order:subscribe', () => {
      socket.join('orders');
    });

    socket.on('dashboard:subscribe', () => {
      socket.join('dashboard');
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  // Attach io to app for use in routes
  (app as any).io = io;

  app.addHook('onClose', () => {
    io.close();
  });
}

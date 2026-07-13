// ============================================================
// POS Yoga — Socket.IO Plugin
// ============================================================

import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@pos-yoga/types';

export async function socketPlugin(app: FastifyInstance) {
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:5173'];

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, {
    cors: {
      origin: corsOrigins,
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

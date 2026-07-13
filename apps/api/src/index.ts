// ============================================================
// POS Yoga — Fastify Server Entry Point
// ============================================================

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { API_PORT, API_HOST } from '@pos-yoga/config';
import { authRoutes } from './routes/auth.routes.js';
import { productRoutes } from './routes/products.routes.js';
import { categoryRoutes } from './routes/categories.routes.js';
import { transactionRoutes } from './routes/transactions.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { customerRoutes } from './routes/customers.routes.js';
import { expenseRoutes } from './routes/expenses.routes.js';
import { shiftRoutes } from './routes/shifts.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { reportRoutes } from './routes/reports.routes.js';
import { backupRoutes } from './routes/backup.routes.js';
import { socketPlugin } from './plugins/socket.js';

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

async function start() {
  // CORS
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:5174'];

  await app.register(cors, {
    origin: [
      ...corsOrigins,
      'http://localhost:5173',
      'http://localhost:5174',
    ],
    credentials: true,
  });

  // Health check
  app.get('/api/health', async () => ({
    success: true,
    message: 'POS Yoga API is running',
    timestamp: new Date().toISOString(),
  }));

  // Register routes
  await app.register(authRoutes);
  await app.register(productRoutes);
  await app.register(categoryRoutes);
  await app.register(transactionRoutes);
  await app.register(dashboardRoutes);
  await app.register(customerRoutes);
  await app.register(expenseRoutes);
  await app.register(shiftRoutes);
  await app.register(settingsRoutes);
  await app.register(reportRoutes);
  await app.register(backupRoutes);

  // Socket.IO
  await app.register(socketPlugin);

  // Start
  const port = Number(process.env.PORT) || API_PORT;
  const host = process.env.HOST || API_HOST;

  await app.listen({ port, host });
  console.log(`🚀 POS Yoga API running at http://${host}:${port}`);
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});

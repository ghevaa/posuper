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
import { midtransRoutes } from './routes/midtrans.routes.js';
import { stockOpnameRoutes } from './routes/stock-opname.routes.js';
import { socketPlugin } from './plugins/socket.js';
import { db } from './db/index.js';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as schema from './db/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

async function start() {
  // Run migrations in production
  try {
    console.log('Running database migrations...');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const path = await import('path');
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), 'apps/api/drizzle'),
    });
    console.log('Database migrations completed successfully!');
  } catch (migError) {
    console.error('Failed to run database migrations:', migError);
  }

  // Seed default admin user and settings if database is empty
  try {
    const userCount = await db.select({ count: schema.user.id }).from(schema.user).limit(1);
    if (userCount.length === 0) {
      console.log('🌱 Database is empty. Running auto-seeding...');
      
      // 1. Seed settings
      const { DEFAULT_SETTINGS } = await import('@pos-yoga/config');
      const { nanoid } = await import('nanoid');
      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await db.insert(schema.settings).values({
          id: nanoid(),
          key,
          value,
        }).onConflictDoNothing();
      }
      
      // 2. Seed default admin user
      console.log('  → Seeding default admin user...');
      const { auth } = await import('./auth.js');
      await auth.api.signUpEmail({
        body: {
          email: 'admin@posyoga.com',
          password: 'admin123',
          name: 'Administrator',
          role: 'developer',
        },
      });
      console.log('Default admin user created successfully!');
    }
  } catch (seedError) {
    console.error('Failed to auto-seed database:', seedError);
  }
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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });

  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '../uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Register Multipart for uploads
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit
    },
  });

  // Register Static to serve uploaded files at /api/uploads/*
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/api/uploads/',
    decorateReply: false,
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
  await app.register(stockOpnameRoutes);
  await app.register(midtransRoutes);

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

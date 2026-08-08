// ============================================================
// POS Yoga — Backup Routes (Developer only)
// ============================================================

import type { FastifyInstance } from 'fastify';
import { requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';
import { db } from '../db/index.js';
import { logs } from '../db/schema.js';
import { desc } from 'drizzle-orm';

export async function backupRoutes(app: FastifyInstance) {
  // Get audit logs
  app.get('/api/logs', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    const { page = '1', limit = '50' } = req.query as any;
    const offset = (Number(page) - 1) * Number(limit);

    const allLogs = await db.select().from(logs)
      .orderBy(desc(logs.createdAt))
      .limit(Number(limit))
      .offset(offset);

    return reply.send({ success: true, data: allLogs });
  });

  // System info (developer)
  app.get('/api/system/info', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    return reply.send({
      success: true,
      data: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: Math.floor(uptime),
        memory: {
          rss: Math.round(memUsage.rss / 1024 / 1024),
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        },
        env: process.env.NODE_ENV || 'development',
      },
    });
  });

  // Full Database Backup JSON Export (admin & dev)
  app.get('/api/backup/export', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const schema = await import('../db/schema.js');
    const backupData = {
      app: 'POS Yoga',
      version: '0.1.52',
      exportedAt: new Date().toISOString(),
      data: {
        users: await db.select().from(schema.user),
        categories: await db.select().from(schema.categories),
        products: await db.select().from(schema.products),
        productVariants: await db.select().from(schema.productVariants),
        categoryOptionGroups: await db.select().from(schema.categoryOptionGroups),
        categoryOptions: await db.select().from(schema.categoryOptions),
        customers: await db.select().from(schema.customers),
        transactions: await db.select().from(schema.transactions),
        transactionItems: await db.select().from(schema.transactionItems),
        payments: await db.select().from(schema.payments),
        cashShifts: await db.select().from(schema.cashShifts),
        expenses: await db.select().from(schema.expenses),
        stockOpnameCategories: await db.select().from(schema.stockOpnameCategories),
        stockOpnameSessions: await db.select().from(schema.stockOpnameSessions),
        stockOpnameItems: await db.select().from(schema.stockOpnameItems),
        settings: await db.select().from(schema.settings),
        logs: await db.select().from(schema.logs),
      }
    };

    await createAuditLog(req, 'backup.downloaded', 'Full database JSON backup downloaded');

    const fileName = `backup-posyoga-${new Date().toISOString().slice(0, 10)}.json`;
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
    return reply.send(JSON.stringify(backupData, null, 2));
  });

  // Backup placeholder (pg_dump needs shell access — handled by Tauri/desktop)
  app.post('/api/backup', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    await createAuditLog(req, 'backup.requested', 'Manual backup requested');
    return reply.send({
      success: true,
      message: 'Backup endpoint. Use pg_dump on server or desktop app for full backup.',
    });
  });
}

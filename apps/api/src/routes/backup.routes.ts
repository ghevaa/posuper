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

  // Backup placeholder (pg_dump needs shell access — handled by Tauri/desktop)
  app.post('/api/backup', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    await createAuditLog(req, 'backup.requested', 'Manual backup requested');
    return reply.send({
      success: true,
      message: 'Backup endpoint. Use pg_dump on server or desktop app for full backup.',
    });
  });
}

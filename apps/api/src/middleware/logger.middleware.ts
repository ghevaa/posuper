// ============================================================
// POS Yoga — Logger Middleware (Audit Log)
// ============================================================

import type { FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { logs } from '../db/schema.js';
import { nanoid } from 'nanoid';

export async function createAuditLog(
  req: FastifyRequest,
  action: string,
  detail?: string,
) {
  try {
    const user = (req as any).user;
    await db.insert(logs).values({
      id: nanoid(),
      userId: user?.id || null,
      action,
      detail: detail || null,
      ipAddress: req.ip,
    });
  } catch (err) {
    // Don't let logging errors break the request
    console.error('Audit log error:', err);
  }
}

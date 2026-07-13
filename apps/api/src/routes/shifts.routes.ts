// ============================================================
// POS Yoga — Cash Shifts Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cashShifts, transactions } from '../db/schema.js';
import { eq, and, gte, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireAuth } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';

export async function shiftRoutes(app: FastifyInstance) {
  // Get current open shift
  app.get('/api/shifts/current', { preHandler: [requireAuth] }, async (req, reply) => {
    const currentUser = (req as any).user;
    const openShift = await db.select().from(cashShifts)
      .where(and(eq(cashShifts.userId, currentUser.id), eq(cashShifts.status, 'open')))
      .limit(1);

    return reply.send({ success: true, data: openShift[0] || null });
  });

  // Open shift
  app.post('/api/shifts/open', { preHandler: [requireAuth] }, async (req, reply) => {
    const currentUser = (req as any).user;
    const body = req.body as any;

    // Check existing open shift
    const existing = await db.select().from(cashShifts)
      .where(and(eq(cashShifts.userId, currentUser.id), eq(cashShifts.status, 'open')))
      .limit(1);

    if (existing.length) {
      return reply.status(400).send({ success: false, error: 'Shift already open' });
    }

    const id = nanoid();
    await db.insert(cashShifts).values({
      id,
      userId: currentUser.id,
      openAmount: String(body.openAmount || 0),
      status: 'open',
    });

    await createAuditLog(req, 'shift.opened', `Opening amount: ${body.openAmount || 0}`);
    return reply.status(201).send({ success: true, data: { id } });
  });

  // Close shift
  app.post('/api/shifts/:id/close', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;

    const shift = await db.select().from(cashShifts).where(eq(cashShifts.id, id)).limit(1);
    if (!shift.length || shift[0].status === 'closed') {
      return reply.status(400).send({ success: false, error: 'Shift not found or already closed' });
    }

    // Calculate expected amount from transactions during shift
    const txSum = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
    }).from(transactions)
      .where(and(
        gte(transactions.createdAt, shift[0].startedAt),
        eq(transactions.userId, shift[0].userId),
        eq(transactions.status, 'completed'),
      ));

    const expectedAmount = Number(shift[0].openAmount) + Number(txSum[0].total);
    const closeAmount = Number(body.closeAmount || 0);
    const difference = closeAmount - expectedAmount;

    await db.update(cashShifts).set({
      closeAmount: String(closeAmount),
      expectedAmount: String(expectedAmount),
      difference: String(difference),
      endedAt: new Date(),
      status: 'closed',
    }).where(eq(cashShifts.id, id));

    await createAuditLog(req, 'shift.closed', `Expected: ${expectedAmount}, Actual: ${closeAmount}, Diff: ${difference}`);
    return reply.send({ success: true, data: { expectedAmount, closeAmount, difference } });
  });

  // List shifts
  app.get('/api/shifts', { preHandler: [requireAuth] }, async (req, reply) => {
    const all = await db.select().from(cashShifts).orderBy(desc(cashShifts.startedAt));
    return reply.send({ success: true, data: all });
  });
}

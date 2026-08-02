// ============================================================
// POS Yoga — Cash Shifts Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { cashShifts, transactions, expenses, user } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
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
      return reply.status(400).send({ success: false, error: 'Shift sudah terbuka', data: existing[0] });
    }

    const id = nanoid();
    const openAmount = String(body.openAmount || 0);
    await db.insert(cashShifts).values({
      id,
      userId: currentUser.id,
      openAmount,
      status: 'open',
    });

    await createAuditLog(req, 'shift.opened', `Opening amount: ${openAmount}`);
    return reply.status(201).send({ success: true, data: { id, openAmount } });
  });

  // Get active/current shift summary for closing modal
  app.get('/api/shifts/current-summary', { preHandler: [requireAuth] }, async (req, reply) => {
    const currentUser = (req as any).user;
    const shift = await db.select().from(cashShifts)
      .where(and(eq(cashShifts.userId, currentUser.id), eq(cashShifts.status, 'open')))
      .limit(1);

    const activeShift = shift[0];
    const startedAt = activeShift ? activeShift.startedAt : new Date(new Date().setHours(0, 0, 0, 0));
    const endedAt = new Date();

    // Query transactions during shift
    const txs = await db.select().from(transactions)
      .where(and(
        gte(transactions.createdAt, startedAt),
        lte(transactions.createdAt, endedAt),
        eq(transactions.status, 'completed'),
        activeShift ? eq(transactions.userId, activeShift.userId) : sql`1=1`
      ));

    // Query expenses during shift
    const exp = await db.select().from(expenses)
      .where(and(
        gte(expenses.date, startedAt),
        lte(expenses.date, endedAt),
        activeShift ? eq(expenses.userId, activeShift.userId) : sql`1=1`
      ));

    let totalSales = 0;
    let totalCashSales = 0;
    let totalQris = 0;
    let totalTransfer = 0;
    let totalNonCash = 0;
    let totalTxCount = txs.length;

    for (const t of txs) {
      const amt = Number(t.total) || 0;
      totalSales += amt;
      if (t.paymentMethod === 'cash') {
        totalCashSales += amt;
      } else if (t.paymentMethod === 'qris') {
        totalQris += amt;
        totalNonCash += amt;
      } else if (t.paymentMethod === 'transfer') {
        totalTransfer += amt;
        totalNonCash += amt;
      } else {
        totalNonCash += amt;
      }
    }

    let totalExpenses = 0;
    for (const e of exp) {
      totalExpenses += Number(e.amount) || 0;
    }

    const openAmount = Number(activeShift?.openAmount || 0);
    const expectedAmount = openAmount + totalCashSales - totalExpenses;

    return reply.send({
      success: true,
      data: {
        shiftId: activeShift?.id || null,
        startedAt,
        endedAt,
        openAmount,
        totalSales,
        totalCashSales,
        totalQris,
        totalTransfer,
        totalNonCash,
        totalExpenses,
        expectedAmount,
        totalTxCount,
      },
    });
  });

  // Close shift
  app.post('/api/shifts/:id/close', { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;

    const shift = await db.select().from(cashShifts).where(eq(cashShifts.id, id)).limit(1);
    if (!shift.length || shift[0].status === 'closed') {
      return reply.status(400).send({ success: false, error: 'Shift tidak ditemukan atau sudah ditutup' });
    }

    const currentShift = shift[0];
    const endedAt = new Date();

    // Sum transactions during shift
    const txs = await db.select().from(transactions)
      .where(and(
        gte(transactions.createdAt, currentShift.startedAt),
        lte(transactions.createdAt, endedAt),
        eq(transactions.userId, currentShift.userId),
        eq(transactions.status, 'completed')
      ));

    // Sum expenses during shift
    const exp = await db.select().from(expenses)
      .where(and(
        gte(expenses.date, currentShift.startedAt),
        lte(expenses.date, endedAt),
        eq(expenses.userId, currentShift.userId)
      ));

    let totalCashSales = 0;
    let totalSales = 0;
    for (const t of txs) {
      const amt = Number(t.total) || 0;
      totalSales += amt;
      if (t.paymentMethod === 'cash') totalCashSales += amt;
    }

    let totalExpenses = 0;
    for (const e of exp) {
      totalExpenses += Number(e.amount) || 0;
    }

    const openAmount = Number(currentShift.openAmount || 0);
    const expectedAmount = openAmount + totalCashSales - totalExpenses;
    const closeAmount = Number(body.closeAmount || 0);
    const difference = closeAmount - expectedAmount;

    await db.update(cashShifts).set({
      closeAmount: String(closeAmount),
      expectedAmount: String(expectedAmount),
      difference: String(difference),
      endedAt,
      status: 'closed',
    }).where(eq(cashShifts.id, id));

    await createAuditLog(req, 'shift.closed', `Open: ${openAmount}, Cash: ${totalCashSales}, Exp: ${totalExpenses}, Expected: ${expectedAmount}, Actual: ${closeAmount}, Diff: ${difference}`);
    return reply.send({
      success: true,
      data: {
        openAmount,
        totalCashSales,
        totalExpenses,
        expectedAmount,
        closeAmount,
        difference,
        endedAt,
      },
    });
  });

  // List shifts
  app.get('/api/shifts', { preHandler: [requireAuth] }, async (req, reply) => {
    const all = await db.select({
      id: cashShifts.id,
      userId: cashShifts.userId,
      userName: user.name,
      userEmail: user.email,
      openAmount: cashShifts.openAmount,
      closeAmount: cashShifts.closeAmount,
      expectedAmount: cashShifts.expectedAmount,
      difference: cashShifts.difference,
      startedAt: cashShifts.startedAt,
      endedAt: cashShifts.endedAt,
      status: cashShifts.status,
    })
      .from(cashShifts)
      .leftJoin(user, eq(cashShifts.userId, user.id))
      .orderBy(desc(cashShifts.startedAt));

    return reply.send({ success: true, data: all });
  });
}


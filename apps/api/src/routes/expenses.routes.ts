// ============================================================
// POS Yoga — Expenses Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { expenses } from '../db/schema.js';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';

export async function expenseRoutes(app: FastifyInstance) {
  app.get('/api/expenses', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { from, to } = req.query as any;
    let conditions: any[] = [];
    if (from) conditions.push(gte(expenses.date, new Date(from)));
    if (to) conditions.push(lte(expenses.date, new Date(to)));

    const all = await db.select().from(expenses)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(expenses.date));
    return reply.send({ success: true, data: all });
  });

  app.post('/api/expenses', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const body = req.body as any;
    const currentUser = (req as any).user;
    const id = nanoid();

    await db.insert(expenses).values({
      id,
      description: body.description,
      amount: String(body.amount),
      date: new Date(body.date || Date.now()),
      userId: currentUser.id,
    });

    await createAuditLog(req, 'expense.created', `Expense: ${body.description}`);
    return reply.status(201).send({ success: true, data: { id } });
  });

  app.delete('/api/expenses/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(expenses).where(eq(expenses.id, id));
    return reply.send({ success: true, message: 'Expense deleted' });
  });
}

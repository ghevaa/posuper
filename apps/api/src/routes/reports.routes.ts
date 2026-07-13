// ============================================================
// POS Yoga — Reports Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, transactionItems, expenses } from '../db/schema.js';
import { sql, and, gte, lte, eq, desc } from 'drizzle-orm';
import { requireRole } from '../middleware/auth.middleware.js';

export async function reportRoutes(app: FastifyInstance) {
  // Sales report
  app.get('/api/reports/sales', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { from, to, groupBy = 'day' } = req.query as any;

    let dateFormat = 'YYYY-MM-DD';
    if (groupBy === 'month') dateFormat = 'YYYY-MM';
    if (groupBy === 'week') dateFormat = 'IYYY-IW';

    let conditions: any[] = [eq(transactions.status, 'completed')];
    if (from) conditions.push(gte(transactions.createdAt, new Date(from)));
    if (to) conditions.push(lte(transactions.createdAt, new Date(to)));

    const report = await db.select({
      period: sql<string>`TO_CHAR(${transactions.createdAt}, ${dateFormat})`,
      totalRevenue: sql<string>`SUM(CAST(${transactions.total} AS DECIMAL))`,
      totalDiscount: sql<string>`SUM(CAST(${transactions.discount} AS DECIMAL))`,
      totalTax: sql<string>`SUM(CAST(${transactions.tax} AS DECIMAL))`,
      orderCount: sql<number>`count(*)`,
    }).from(transactions)
      .where(and(...conditions))
      .groupBy(sql`TO_CHAR(${transactions.createdAt}, ${dateFormat})`)
      .orderBy(sql`TO_CHAR(${transactions.createdAt}, ${dateFormat})`);

    return reply.send({ success: true, data: report });
  });

  // Product sales report
  app.get('/api/reports/products', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { from, to } = req.query as any;

    let conditions: any[] = [eq(transactions.status, 'completed')];
    if (from) conditions.push(gte(transactions.createdAt, new Date(from)));
    if (to) conditions.push(lte(transactions.createdAt, new Date(to)));

    const report = await db.select({
      productName: transactionItems.productName,
      totalQty: sql<number>`SUM(${transactionItems.qty})`,
      totalRevenue: sql<string>`SUM(CAST(${transactionItems.subtotal} AS DECIMAL))`,
    }).from(transactionItems)
      .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
      .where(and(...conditions))
      .groupBy(transactionItems.productName)
      .orderBy(sql`SUM(${transactionItems.qty}) DESC`);

    return reply.send({ success: true, data: report });
  });

  // Expense report
  app.get('/api/reports/expenses', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { from, to } = req.query as any;

    let conditions: any[] = [];
    if (from) conditions.push(gte(expenses.date, new Date(from)));
    if (to) conditions.push(lte(expenses.date, new Date(to)));

    const totalExpenses = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(${expenses.amount} AS DECIMAL)), 0)`,
    }).from(expenses)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const all = await db.select().from(expenses)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(expenses.date));

    return reply.send({
      success: true,
      data: { total: Number(totalExpenses[0].total), items: all },
    });
  });
}

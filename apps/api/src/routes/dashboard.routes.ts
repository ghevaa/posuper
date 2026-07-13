// ============================================================
// POS Yoga — Dashboard Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { transactions, transactionItems, products } from '../db/schema.js';
import { sql, gte, and, eq } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';

export async function dashboardRoutes(app: FastifyInstance) {
  // Dashboard stats (admin+)
  app.get('/api/dashboard', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Revenue today
    const revToday = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, today), eq(transactions.status, 'completed')));

    // Revenue week
    const revWeek = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, weekAgo), eq(transactions.status, 'completed')));

    // Revenue month
    const revMonth = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, monthStart), eq(transactions.status, 'completed')));

    // Total orders today
    const ordersToday = await db.select({
      count: sql<number>`count(*)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, today), eq(transactions.status, 'completed')));

    // Top products (last 30 days)
    const topProducts = await db.select({
      name: transactionItems.productName,
      qty: sql<number>`SUM(${transactionItems.qty})`,
      revenue: sql<string>`SUM(CAST(${transactionItems.subtotal} AS DECIMAL))`,
    }).from(transactionItems)
      .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
      .where(and(gte(transactions.createdAt, monthStart), eq(transactions.status, 'completed')))
      .groupBy(transactionItems.productName)
      .orderBy(sql`SUM(${transactionItems.qty}) DESC`)
      .limit(10);

    // Peak hours today
    const peakHours = await db.select({
      hour: sql<number>`EXTRACT(HOUR FROM ${transactions.createdAt})`,
      count: sql<number>`count(*)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, today), eq(transactions.status, 'completed')))
      .groupBy(sql`EXTRACT(HOUR FROM ${transactions.createdAt})`)
      .orderBy(sql`EXTRACT(HOUR FROM ${transactions.createdAt})`);

    // Revenue chart (last 7 days)
    const revenueChart = await db.select({
      date: sql<string>`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`,
      revenue: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, weekAgo), eq(transactions.status, 'completed')))
      .groupBy(sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`);

    // Order chart (last 7 days)
    const orderChart = await db.select({
      date: sql<string>`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, weekAgo), eq(transactions.status, 'completed')))
      .groupBy(sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${transactions.createdAt}, 'YYYY-MM-DD')`);

    return reply.send({
      success: true,
      data: {
        revenueToday: Number(revToday[0].total),
        revenueWeek: Number(revWeek[0].total),
        revenueMonth: Number(revMonth[0].total),
        totalOrders: Number(ordersToday[0].count),
        topProducts: topProducts.map(p => ({
          name: p.name,
          qty: Number(p.qty),
          revenue: Number(p.revenue),
        })),
        peakHours: peakHours.map(h => ({
          hour: Number(h.hour),
          count: Number(h.count),
        })),
        revenueChart: revenueChart.map(r => ({
          date: r.date,
          revenue: Number(r.revenue),
        })),
        orderChart: orderChart.map(o => ({
          date: o.date,
          count: Number(o.count),
        })),
      },
    });
  });
}

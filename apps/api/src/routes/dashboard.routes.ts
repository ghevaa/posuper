// ============================================================
// POS Yoga — Dashboard & Business Analytics Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  transactions,
  transactionItems,
  products,
  productVariants,
  categoryOptions,
  categoryOptionGroups,
  expenses,
} from '../db/schema.js';
import { sql, and, gte, lte, eq } from 'drizzle-orm';
import { requireRole } from '../middleware/auth.middleware.js';

export async function dashboardRoutes(app: FastifyInstance) {
  // Dashboard stats & Business Analysis (admin+)
  app.get('/api/dashboard', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const query = req.query as {
      period?: string;
      from?: string;
      to?: string;
    };

    const period = query.period || 'today';
    const now = new Date();

    // ─── 1. Determine Date Ranges (Current & Previous for Comparison) ───
    let currentStart: Date;
    let currentEnd: Date;
    let prevStart: Date;
    let prevEnd: Date;
    let isSingleDay = false;

    // Helper: start and end of day
    const getStartOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const getEndOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    const todayStart = getStartOfDay(now);
    const todayEnd = getEndOfDay(now);

    switch (period) {
      case 'yesterday': {
        const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        currentStart = getStartOfDay(y);
        currentEnd = getEndOfDay(y);

        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        prevStart = getStartOfDay(twoDaysAgo);
        prevEnd = getEndOfDay(twoDaysAgo);
        isSingleDay = true;
        break;
      }
      case '7days': {
        const sevenDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
        currentStart = getStartOfDay(sevenDaysAgo);
        currentEnd = todayEnd;

        const fourteenDaysAgo = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000);
        const eightDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevStart = getStartOfDay(fourteenDaysAgo);
        prevEnd = getEndOfDay(eightDaysAgo);
        break;
      }
      case 'this_week': {
        const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon...
        const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now.getTime() - diffToMon * 24 * 60 * 60 * 1000);
        currentStart = getStartOfDay(monday);
        currentEnd = todayEnd;

        const prevMonday = new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000);
        const prevSunday = new Date(prevMonday.getTime() + diffToMon * 24 * 60 * 60 * 1000);
        prevStart = getStartOfDay(prevMonday);
        prevEnd = getEndOfDay(prevSunday);
        break;
      }
      case 'last_week': {
        const dayOfWeek = now.getDay();
        const diffToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const lastMon = new Date(now.getTime() - (diffToMon + 7) * 24 * 60 * 60 * 1000);
        const lastSun = new Date(lastMon.getTime() + 6 * 24 * 60 * 60 * 1000);
        currentStart = getStartOfDay(lastMon);
        currentEnd = getEndOfDay(lastSun);

        const twoWeeksMon = new Date(lastMon.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksSun = new Date(twoWeeksMon.getTime() + 6 * 24 * 60 * 60 * 1000);
        prevStart = getStartOfDay(twoWeeksMon);
        prevEnd = getEndOfDay(twoWeeksSun);
        break;
      }
      case '30days': {
        const thirtyDaysAgo = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
        currentStart = getStartOfDay(thirtyDaysAgo);
        currentEnd = todayEnd;

        const sixtyDaysAgo = new Date(now.getTime() - 59 * 24 * 60 * 60 * 1000);
        const thirtyOneDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        prevStart = getStartOfDay(sixtyDaysAgo);
        prevEnd = getEndOfDay(thirtyOneDaysAgo);
        break;
      }
      case 'this_month': {
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        currentEnd = todayEnd;

        const daysInCurrentPeriod = Math.floor((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000));
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        prevEnd = new Date(prevStart.getTime() + daysInCurrentPeriod * 24 * 60 * 60 * 1000 + (23 * 3600 + 59 * 60 + 59) * 1000);
        break;
      }
      case 'last_month': {
        currentStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        currentEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

        prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
        prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
        break;
      }
      case 'custom': {
        if (query.from && query.to) {
          const [fYear, fMonth, fDay] = query.from.split('-').map(Number);
          const [tYear, tMonth, tDay] = query.to.split('-').map(Number);
          currentStart = new Date(fYear, fMonth - 1, fDay, 0, 0, 0, 0);
          currentEnd = new Date(tYear, tMonth - 1, tDay, 23, 59, 59, 999);
        } else if (query.from) {
          const [fYear, fMonth, fDay] = query.from.split('-').map(Number);
          currentStart = new Date(fYear, fMonth - 1, fDay, 0, 0, 0, 0);
          currentEnd = todayEnd;
        } else {
          currentStart = todayStart;
          currentEnd = todayEnd;
        }

        const durationMs = currentEnd.getTime() - currentStart.getTime();
        prevStart = new Date(currentStart.getTime() - durationMs - 1);
        prevEnd = new Date(currentStart.getTime() - 1);

        if (currentStart.toDateString() === currentEnd.toDateString()) {
          isSingleDay = true;
        }
        break;
      }
      case 'today':
      default: {
        currentStart = todayStart;
        currentEnd = todayEnd;

        const y = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        prevStart = getStartOfDay(y);
        prevEnd = getEndOfDay(y);
        isSingleDay = true;
        break;
      }
    }

    // ─── 2. Preload Master Data for Intelligent Cost Resolution Engine ───
    const [allProducts, allVariants, allCategoryOptions, allOptionGroups] = await Promise.all([
      db.select({
        id: products.id,
        name: products.name,
        cost: products.cost,
        price: products.price,
      }).from(products),
      db.select({
        id: productVariants.id,
        productId: productVariants.productId,
        name: productVariants.name,
        cost: productVariants.cost,
      }).from(productVariants),
      db.select({
        id: categoryOptions.id,
        groupId: categoryOptions.groupId,
        name: categoryOptions.name,
        cost: categoryOptions.cost,
        price: categoryOptions.price,
      }).from(categoryOptions),
      db.select({
        id: categoryOptionGroups.id,
        name: categoryOptionGroups.name,
      }).from(categoryOptionGroups),
    ]);

    // Build lookup indexes
    const variantById: Record<string, number> = {};
    const variantByProductAndName: Record<string, number> = {};
    const variantByProductNameAndName: Record<string, number> = {};
    const variantByName: Record<string, number> = {};
    const productById: Record<string, number> = {};
    const productByName: Record<string, number> = {};
    const categoryOptionByName: Record<string, number> = {};
    const groupOptionCostMap: Record<string, number> = {};
    const groupOptionPriceCostMap: Record<string, number> = {};

    const prodIdToName: Record<string, string> = {};
    const groupNameById: Record<string, string> = {};

    allOptionGroups.forEach((g) => {
      if (g.name) groupNameById[g.id] = g.name.toLowerCase().trim();
    });

    allProducts.forEach((p) => {
      const pCost = Number(p.cost) || 0;
      productById[p.id] = pCost;
      if (p.name) {
        prodIdToName[p.id] = p.name;
        productByName[p.name.toLowerCase().trim()] = pCost;
      }
    });

    allVariants.forEach((v) => {
      const vCost = Number(v.cost) || 0;
      variantById[v.id] = vCost;
      if (v.name) {
        const vNameLower = v.name.toLowerCase().trim();
        variantByName[vNameLower] = vCost;
        if (v.productId) {
          variantByProductAndName[`${v.productId}__${vNameLower}`] = vCost;
          const pName = prodIdToName[v.productId];
          if (pName) {
            variantByProductNameAndName[`${pName.toLowerCase().trim()}__${vNameLower}`] = vCost;
          }
        }
      }
    });

    allCategoryOptions.forEach((opt) => {
      const optCost = Number(opt.cost) || 0;
      const optPrice = Math.round(Number(opt.price) || 0);
      const gName = groupNameById[opt.groupId || ''] || '';
      const oName = (opt.name || '').toLowerCase().trim();

      if (oName) {
        categoryOptionByName[oName] = optCost;
      }
      if (gName && oName) {
        const key = `${gName} ${oName}`;
        groupOptionCostMap[key] = optCost;
        groupOptionPriceCostMap[`${key}__${optPrice}`] = optCost;
        groupOptionCostMap[`+ ${key}`] = optCost;
        groupOptionPriceCostMap[`+ ${key}__${optPrice}`] = optCost;
      }
    });

    function resolveItemCost(item: any): number {
      const pName = (item.productName || '').trim();
      const pNameLower = pName.toLowerCase();
      const vName = (item.variantName || '').trim();
      const vNameLower = vName.toLowerCase();
      const itemPrice = Math.round(Number(item.price) || 0);

      // 1. Direct variant cost from join
      if (item.variantCost && Number(item.variantCost) > 0) {
        return Number(item.variantCost);
      }

      // 2. Lookup by variantId
      if (item.variantId && variantById[item.variantId] !== undefined && variantById[item.variantId] > 0) {
        return variantById[item.variantId];
      }

      // 3. Lookup by (productId + variantName)
      if (item.productId && vNameLower) {
        const key = `${item.productId}__${vNameLower}`;
        if (variantByProductAndName[key] !== undefined && variantByProductAndName[key] > 0) {
          return variantByProductAndName[key];
        }
      }

      // 4. Lookup by (productName + variantName) (e.g. spagetti + bolognese)
      if (pNameLower && vNameLower && vNameLower !== 'biasa' && vNameLower !== 'biasa / regular' && vNameLower !== 'regular' && vNameLower !== '-') {
        const key = `${pNameLower}__${vNameLower}`;
        if (variantByProductNameAndName[key] !== undefined && variantByProductNameAndName[key] > 0) {
          return variantByProductNameAndName[key];
        }
        if (variantByName[vNameLower] !== undefined && variantByName[vNameLower] > 0) {
          return variantByName[vNameLower];
        }
      }

      // 5. Cleaned sub-item / option check (e.g. "+ ayam crispy bbq spicy")
      const cleanName = pName.replace(/^\+\s*/, '').trim();
      const cleanNameLower = cleanName.toLowerCase();

      // Check group + option exact match
      if (groupOptionPriceCostMap[`${cleanNameLower}__${itemPrice}`] !== undefined && groupOptionPriceCostMap[`${cleanNameLower}__${itemPrice}`] > 0) {
        return groupOptionPriceCostMap[`${cleanNameLower}__${itemPrice}`];
      }
      if (groupOptionCostMap[cleanNameLower] !== undefined && groupOptionCostMap[cleanNameLower] > 0) {
        return groupOptionCostMap[cleanNameLower];
      }
      if (groupOptionPriceCostMap[`${pNameLower}__${itemPrice}`] !== undefined && groupOptionPriceCostMap[`${pNameLower}__${itemPrice}`] > 0) {
        return groupOptionPriceCostMap[`${pNameLower}__${itemPrice}`];
      }
      if (groupOptionCostMap[pNameLower] !== undefined && groupOptionCostMap[pNameLower] > 0) {
        return groupOptionCostMap[pNameLower];
      }

      if (categoryOptionByName[cleanNameLower] !== undefined && categoryOptionByName[cleanNameLower] > 0) {
        return categoryOptionByName[cleanNameLower];
      }
      if (vNameLower && categoryOptionByName[vNameLower] !== undefined && categoryOptionByName[vNameLower] > 0) {
        return categoryOptionByName[vNameLower];
      }

      // Check across variants for match in cleanName
      for (const v of allVariants) {
        const vMatch = v.name.toLowerCase().trim();
        if (vMatch && cleanNameLower.includes(vMatch) && Number(v.cost) > 0) {
          return Number(v.cost);
        }
      }

      // Check across category options for match
      for (const opt of allCategoryOptions) {
        const optMatch = opt.name.toLowerCase().trim();
        if (optMatch && cleanNameLower.includes(optMatch) && Number(opt.cost) > 0) {
          return Number(opt.cost);
        }
      }

      // 6. Direct product cost
      if (item.productCost && Number(item.productCost) > 0) {
        return Number(item.productCost);
      }

      // 7. Product by ID or Name
      if (item.productId && productById[item.productId] !== undefined && productById[item.productId] > 0) {
        return productById[item.productId];
      }
      if (productByName[pNameLower] !== undefined && productByName[pNameLower] > 0) {
        return productByName[pNameLower];
      }
      if (productByName[cleanNameLower] !== undefined && productByName[cleanNameLower] > 0) {
        return productByName[cleanNameLower];
      }

      return 0;
    }

    // ─── 3. Fetch Current Period Transactions & Items ───
    const [currentTxList, currentExpensesList] = await Promise.all([
      db.select({
        id: transactions.id,
        total: transactions.total,
        subtotal: transactions.subtotal,
        discount: transactions.discount,
        tax: transactions.tax,
        paymentMethod: transactions.paymentMethod,
        orderType: transactions.orderType,
        createdAt: transactions.createdAt,
      })
        .from(transactions)
        .where(
          and(
            gte(transactions.createdAt, currentStart),
            lte(transactions.createdAt, currentEnd),
            eq(transactions.status, 'completed'),
          ),
        ),
      db.select({
        id: expenses.id,
        amount: expenses.amount,
        createdAt: expenses.createdAt,
      })
        .from(expenses)
        .where(
          and(
            gte(expenses.date, currentStart),
            lte(expenses.date, currentEnd),
          ),
        ),
    ]);

    // Fetch items for current period
    const currentTxIds = currentTxList.map((t) => t.id);
    let currentItemsList: any[] = [];
    if (currentTxIds.length > 0) {
      currentItemsList = await db.select({
        transactionId: transactionItems.transactionId,
        productId: transactionItems.productId,
        productName: transactionItems.productName,
        variantId: transactionItems.variantId,
        variantName: transactionItems.variantName,
        qty: transactionItems.qty,
        price: transactionItems.price,
        subtotal: transactionItems.subtotal,
        productCost: products.cost,
        variantCost: productVariants.cost,
        createdAt: transactions.createdAt,
      })
        .from(transactionItems)
        .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
        .leftJoin(products, eq(transactionItems.productId, products.id))
        .leftJoin(productVariants, eq(transactionItems.variantId, productVariants.id))
        .where(
          and(
            gte(transactions.createdAt, currentStart),
            lte(transactions.createdAt, currentEnd),
            eq(transactions.status, 'completed'),
          ),
        );
    }

    // ─── 4. Fetch Previous Period Data for Comparison ───
    const [prevTxList, prevExpensesList] = await Promise.all([
      db.select({
        id: transactions.id,
        total: transactions.total,
      })
        .from(transactions)
        .where(
          and(
            gte(transactions.createdAt, prevStart),
            lte(transactions.createdAt, prevEnd),
            eq(transactions.status, 'completed'),
          ),
        ),
      db.select({
        amount: expenses.amount,
      })
        .from(expenses)
        .where(
          and(
            gte(expenses.date, prevStart),
            lte(expenses.date, prevEnd),
          ),
        ),
    ]);

    const prevTxIds = prevTxList.map((t) => t.id);
    let prevItemsList: any[] = [];
    if (prevTxIds.length > 0) {
      prevItemsList = await db.select({
        transactionId: transactionItems.transactionId,
        productId: transactionItems.productId,
        productName: transactionItems.productName,
        variantId: transactionItems.variantId,
        variantName: transactionItems.variantName,
        qty: transactionItems.qty,
        price: transactionItems.price,
        subtotal: transactionItems.subtotal,
        productCost: products.cost,
        variantCost: productVariants.cost,
      })
        .from(transactionItems)
        .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
        .leftJoin(products, eq(transactionItems.productId, products.id))
        .leftJoin(productVariants, eq(transactionItems.variantId, productVariants.id))
        .where(
          and(
            gte(transactions.createdAt, prevStart),
            lte(transactions.createdAt, prevEnd),
            eq(transactions.status, 'completed'),
          ),
        );
    }

    // ─── 5. Calculate Metrics (Current Period) ───
    let totalRevenue = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let totalOrders = currentTxList.length;

    const paymentBreakdown: Record<string, { count: number; total: number }> = {
      cash: { count: 0, total: 0 },
      qris: { count: 0, total: 0 },
      transfer: { count: 0, total: 0 },
    };

    const orderTypeBreakdown: Record<string, { count: number; total: number }> = {
      dine_in: { count: 0, total: 0 },
      take_away: { count: 0, total: 0 },
    };

    const peakHoursMap: Record<number, number> = {};
    for (let h = 0; h < 24; h++) peakHoursMap[h] = 0;

    // Trend grouping: hourly if single day, daily if multi-day
    const trendMap: Record<string, { label: string; revenue: number; cost: number; expenses: number; profit: number; orders: number }> = {};

    if (isSingleDay) {
      for (let h = 0; h < 24; h++) {
        const hourStr = `${String(h).padStart(2, '0')}:00`;
        trendMap[hourStr] = { label: hourStr, revenue: 0, cost: 0, expenses: 0, profit: 0, orders: 0 };
      }
    } else {
      // Prepopulate all days in range
      const cur = new Date(currentStart);
      while (cur <= currentEnd) {
        const dateStr = cur.toISOString().split('T')[0];
        trendMap[dateStr] = { label: dateStr, revenue: 0, cost: 0, expenses: 0, profit: 0, orders: 0 };
        cur.setDate(cur.getDate() + 1);
      }
    }

    currentTxList.forEach((tx) => {
      const rev = Number(tx.total) || 0;
      totalRevenue += rev;
      totalDiscount += Number(tx.discount) || 0;
      totalTax += Number(tx.tax) || 0;

      // Payment breakdown
      const method = (tx.paymentMethod || 'cash').toLowerCase();
      if (paymentBreakdown[method]) {
        paymentBreakdown[method].count += 1;
        paymentBreakdown[method].total += rev;
      } else {
        paymentBreakdown[method] = { count: 1, total: rev };
      }

      // Order type breakdown
      const oType = (tx.orderType || 'dine_in').toLowerCase();
      if (orderTypeBreakdown[oType]) {
        orderTypeBreakdown[oType].count += 1;
        orderTypeBreakdown[oType].total += rev;
      }

      // Peak hours & Trend mapping
      if (tx.createdAt) {
        const d = new Date(tx.createdAt);
        const h = d.getHours();
        peakHoursMap[h] = (peakHoursMap[h] || 0) + 1;

        if (isSingleDay) {
          const hourStr = `${String(h).padStart(2, '0')}:00`;
          if (trendMap[hourStr]) {
            trendMap[hourStr].revenue += rev;
            trendMap[hourStr].orders += 1;
          }
        } else {
          const dateStr = d.toISOString().split('T')[0];
          if (trendMap[dateStr]) {
            trendMap[dateStr].revenue += rev;
            trendMap[dateStr].orders += 1;
          }
        }
      }
    });

    // Calculate total cost and product sales ranking
    let totalCost = 0;
    const productRankingMap: Record<string, {
      productName: string;
      variantName: string;
      qty: number;
      price: number;
      revenue: number;
      cost: number;
      profit: number;
    }> = {};

    currentItemsList.forEach((it) => {
      const qtyVal = Number(it.qty) || 0;
      const subtotalVal = Number(it.subtotal) || (qtyVal * Number(it.price || 0));
      const unitCost = resolveItemCost(it);
      const itemCost = qtyVal * unitCost;

      totalCost += itemCost;

      // Add cost to trend map
      if (it.createdAt) {
        const d = new Date(it.createdAt);
        if (isSingleDay) {
          const hourStr = `${String(d.getHours()).padStart(2, '0')}:00`;
          if (trendMap[hourStr]) trendMap[hourStr].cost += itemCost;
        } else {
          const dateStr = d.toISOString().split('T')[0];
          if (trendMap[dateStr]) trendMap[dateStr].cost += itemCost;
        }
      }

      // Product grouping key
      const key = `${it.productName}____${it.variantName || 'Biasa / Regular'}`;
      if (!productRankingMap[key]) {
        productRankingMap[key] = {
          productName: it.productName,
          variantName: it.variantName || 'Biasa / Regular',
          qty: 0,
          price: Number(it.price) || 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };
      }
      productRankingMap[key].qty += qtyVal;
      productRankingMap[key].revenue += subtotalVal;
      productRankingMap[key].cost += itemCost;
      productRankingMap[key].profit += (subtotalVal - itemCost);
    });

    // Calculate total expenses
    let totalExpenses = 0;
    currentExpensesList.forEach((exp) => {
      const expAmt = Number(exp.amount) || 0;
      totalExpenses += expAmt;

      if (exp.createdAt) {
        const d = new Date(exp.createdAt);
        if (isSingleDay) {
          const hourStr = `${String(d.getHours()).padStart(2, '0')}:00`;
          if (trendMap[hourStr]) trendMap[hourStr].expenses += expAmt;
        } else {
          const dateStr = d.toISOString().split('T')[0];
          if (trendMap[dateStr]) trendMap[dateStr].expenses += expAmt;
        }
      }
    });

    // Net Profit & Profit Margin
    const netProfit = totalRevenue - totalCost - totalExpenses;
    const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0;
    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    // Finalize trend profit
    Object.values(trendMap).forEach((p) => {
      p.profit = p.revenue - p.cost - p.expenses;
    });

    // Sort top products
    const topProducts = Object.values(productRankingMap)
      .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
      .map((item, idx) => ({
        rank: idx + 1,
        name: item.productName,
        variantName: item.variantName,
        qty: item.qty,
        price: item.price,
        revenue: item.revenue,
        cost: item.cost,
        profit: item.profit,
        percentage: totalRevenue > 0 ? Math.round((item.revenue / totalRevenue) * 100) : 0,
      }));

    // ─── 6. Calculate Metrics for Previous Period (For Growth %) ───
    let prevRevenue = 0;
    prevTxList.forEach((tx) => {
      prevRevenue += Number(tx.total) || 0;
    });

    let prevCost = 0;
    prevItemsList.forEach((it) => {
      const qtyVal = Number(it.qty) || 0;
      const unitCost = resolveItemCost(it);
      prevCost += qtyVal * unitCost;
    });

    let prevExpenses = 0;
    prevExpensesList.forEach((exp) => {
      prevExpenses += Number(exp.amount) || 0;
    });

    const prevOrders = prevTxList.length;
    const prevProfit = prevRevenue - prevCost - prevExpenses;
    const prevAov = prevOrders > 0 ? Math.round(prevRevenue / prevOrders) : 0;

    const calcGrowth = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(1));
    };

    const growth = {
      revenue: calcGrowth(totalRevenue, prevRevenue),
      cost: calcGrowth(totalCost, prevCost),
      expenses: calcGrowth(totalExpenses, prevExpenses),
      profit: calcGrowth(netProfit, prevProfit),
      orders: calcGrowth(totalOrders, prevOrders),
      aov: calcGrowth(aov, prevAov),
      revenueDiff: totalRevenue - prevRevenue,
      profitDiff: netProfit - prevProfit,
      ordersDiff: totalOrders - prevOrders,
      aovDiff: aov - prevAov,
    };

    // ─── 7. Legacy Properties (For backward compatibility) ───
    const revToday = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, todayStart), eq(transactions.status, 'completed')));

    const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const revWeek = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, weekAgo), eq(transactions.status, 'completed')));

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const revMonth = await db.select({
      total: sql<string>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
    }).from(transactions)
      .where(and(gte(transactions.createdAt, monthStart), eq(transactions.status, 'completed')));

    return reply.send({
      success: true,
      data: {
        // Active Filter Context
        period,
        dateRange: {
          from: currentStart.toISOString(),
          to: currentEnd.toISOString(),
          isSingleDay,
        },
        // Core KPIs
        totalRevenue,
        totalCost,
        totalExpenses,
        netProfit,
        profitMargin: Number(profitMargin.toFixed(1)),
        totalOrders,
        aov,
        totalDiscount,
        totalTax,
        // Growth vs Previous Period
        growth,
        // Charts & Analysis
        trendChart: Object.values(trendMap),
        topProducts,
        paymentBreakdown,
        orderTypeBreakdown,
        peakHours: Object.entries(peakHoursMap).map(([hour, count]) => ({
          hour: Number(hour),
          count,
        })),
        // Legacy fields for backward compatibility
        revenueToday: Number(revToday[0]?.total || 0),
        revenueWeek: Number(revWeek[0]?.total || 0),
        revenueMonth: Number(revMonth[0]?.total || 0),
      },
    });
  });
}

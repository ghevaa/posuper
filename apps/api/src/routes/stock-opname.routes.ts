// ============================================================
// POS Yoga — Stock Opname (Physical Inventory Count) Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { stockOpnameSessions, stockOpnameItems, stockOpnameCategories, products } from '../db/schema.js';
import { eq, desc, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';
import ExcelJS from 'exceljs';

type StockInEntry = { date: string; qty: number };

function sumEntries(entries: StockInEntry[] | null | undefined): number {
  if (!entries || !Array.isArray(entries)) return 0;
  return entries.reduce((sum, e) => sum + (Number(e.qty) || 0), 0);
}

export async function stockOpnameRoutes(app: FastifyInstance) {
  // ─── List / Create Stock Opname Categories ─────────────────
  app.get('/api/stock-opname/categories', { preHandler: [requireRole('developer', 'admin', 'cashier')] }, async (_req, reply) => {
    const cats = await db.select().from(stockOpnameCategories).orderBy(asc(stockOpnameCategories.sortOrder), asc(stockOpnameCategories.name));
    return reply.send({ success: true, data: cats });
  });

  app.post('/api/stock-opname/categories', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const body = req.body as { name: string };
    if (!body.name || !body.name.trim()) {
      return reply.status(400).send({ success: false, error: 'Nama kategori wajib diisi' });
    }
    const id = nanoid();
    await db.insert(stockOpnameCategories).values({ id, name: body.name.trim(), sortOrder: 999 });
    await createAuditLog(req, 'stock_opname_category.created', `Category "${body.name}" created`);
    return reply.status(201).send({ success: true, data: { id, name: body.name.trim() } });
  });

  app.put('/api/stock-opname/categories/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { name: string };
    if (!body.name || !body.name.trim()) {
      return reply.status(400).send({ success: false, error: 'Nama kategori wajib diisi' });
    }
    await db.update(stockOpnameCategories).set({ name: body.name.trim() }).where(eq(stockOpnameCategories.id, id));
    await createAuditLog(req, 'stock_opname_category.updated', `Category ${id} updated to "${body.name}"`);
    return reply.send({ success: true, message: 'Kategori diperbarui' });
  });

  app.delete('/api/stock-opname/categories/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(stockOpnameCategories).where(eq(stockOpnameCategories.id, id));
    await createAuditLog(req, 'stock_opname_category.deleted', `Category ${id} deleted`);
    return reply.send({ success: true, message: 'Kategori dihapus' });
  });

  // ─── Create new stock opname session ───────────────────────
  app.post('/api/stock-opname', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const body = req.body as { name: string; date: string; notes?: string };
    const currentUser = (req as any).user;
    const sessionId = nanoid();

    // Insert session
    await db.insert(stockOpnameSessions).values({
      id: sessionId,
      name: body.name,
      date: new Date(body.date),
      userId: currentUser.id,
      notes: body.notes || null,
    });

    // Fetch all active products
    const activeProducts = await db.select().from(products).where(eq(products.isActive, true));

    // Auto-generate items for each active product
    const itemValues = activeProducts.map((product) => ({
      id: nanoid(),
      sessionId,
      productId: product.id,
      categoryId: null as string | null,
      productName: product.name,
      unit: 'Pcs',
      stockStart: product.stock,
      stockIn: 0,
      stockInEntries: [] as StockInEntry[],
      stockReal: 0,
      usage: 0,
      waste: 0,
      notes: null as string | null,
    }));

    if (itemValues.length > 0) {
      await db.insert(stockOpnameItems).values(itemValues);
    }

    // Fetch the created session with items
    const created = await db.query.stockOpnameSessions.findFirst({
      where: eq(stockOpnameSessions.id, sessionId),
      with: { items: true, user: { columns: { id: true, name: true } } },
    });

    await createAuditLog(req, 'stock_opname.created', `Session "${body.name}" created with ${itemValues.length} items`);

    return reply.status(201).send({
      success: true,
      data: created,
      message: 'Stock opname session created',
    });
  });

  // ─── List all sessions ─────────────────────────────────────
  app.get('/api/stock-opname', { preHandler: [requireRole('developer', 'admin', 'cashier')] }, async (req, reply) => {
    const sessions = await db.query.stockOpnameSessions.findMany({
      orderBy: [desc(stockOpnameSessions.date)],
      with: {
        user: { columns: { id: true, name: true } },
        items: true,
      },
    });

    // Map to include item count
    const data = sessions.map((s) => ({
      ...s,
      itemCount: s.items.length,
    }));

    return reply.send({ success: true, data });
  });

  // ─── Get session detail ────────────────────────────────────
  app.get('/api/stock-opname/:id', { preHandler: [requireRole('developer', 'admin', 'cashier')] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const session = await db.query.stockOpnameSessions.findFirst({
      where: eq(stockOpnameSessions.id, id),
      with: {
        items: true,
        user: { columns: { id: true, name: true } },
      },
    });

    if (!session) {
      return reply.status(404).send({ success: false, error: 'Stock opname session not found' });
    }

    return reply.send({ success: true, data: session });
  });

  // ─── Add a custom item (bahan baku) to an existing session ──
  app.post('/api/stock-opname/:id/items', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      productName: string;
      unit?: string;
      categoryId?: string | null;
      stockStart?: number;
    };

    if (!body.productName || !body.productName.trim()) {
      return reply.status(400).send({ success: false, error: 'Nama bahan wajib diisi' });
    }

    const session = await db.select().from(stockOpnameSessions).where(eq(stockOpnameSessions.id, id)).limit(1);
    if (!session.length) {
      return reply.status(404).send({ success: false, error: 'Stock opname session not found' });
    }

    const newItem = {
      id: nanoid(),
      sessionId: id,
      productId: null as string | null,
      categoryId: body.categoryId || null,
      productName: body.productName.trim(),
      unit: body.unit?.trim() || 'Pcs',
      stockStart: Number(body.stockStart) || 0,
      stockIn: 0,
      stockInEntries: [] as StockInEntry[],
      stockReal: 0,
      usage: Number(body.stockStart) || 0,
      waste: 0,
      notes: null as string | null,
    };

    await db.insert(stockOpnameItems).values(newItem);
    await createAuditLog(req, 'stock_opname.item_added', `Item "${body.productName}" added to session ${id}`);

    return reply.status(201).send({ success: true, data: newItem, message: 'Bahan berhasil ditambahkan' });
  });

  // ─── Delete an item from a session ─────────────────────────
  app.delete('/api/stock-opname/:id/items/:itemId', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { itemId } = req.params as { id: string; itemId: string };
    await db.delete(stockOpnameItems).where(eq(stockOpnameItems.id, itemId));
    await createAuditLog(req, 'stock_opname.item_deleted', `Item ${itemId} deleted`);
    return reply.send({ success: true, message: 'Bahan dihapus' });
  });

  // ─── Bulk update items ─────────────────────────────────────
  app.put('/api/stock-opname/:id/items', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      items: Array<{
        id: string;
        unit?: string;
        categoryId?: string | null;
        stockStart?: number;
        stockInEntries?: StockInEntry[];
        stockReal?: number;
        waste?: number;
        notes?: string;
      }>;
    };

    // Verify session exists
    const session = await db.select().from(stockOpnameSessions).where(eq(stockOpnameSessions.id, id)).limit(1);
    if (!session.length) {
      return reply.status(404).send({ success: false, error: 'Stock opname session not found' });
    }

    // Update each item
    for (const item of body.items) {
      // Fetch current item to merge values
      const existing = await db.select().from(stockOpnameItems).where(eq(stockOpnameItems.id, item.id)).limit(1);
      if (!existing.length) continue;

      const current = existing[0];
      const stockStart = item.stockStart ?? current.stockStart;
      const stockInEntries = item.stockInEntries ?? (current.stockInEntries as StockInEntry[]);
      const stockIn = sumEntries(stockInEntries);
      const stockReal = item.stockReal ?? current.stockReal;
      const usage = stockStart + stockIn - stockReal;

      await db.update(stockOpnameItems).set({
        unit: item.unit ?? current.unit,
        categoryId: item.categoryId !== undefined ? item.categoryId : current.categoryId,
        stockStart,
        stockIn,
        stockInEntries,
        stockReal,
        usage,
        waste: item.waste ?? current.waste,
        notes: item.notes !== undefined ? item.notes : current.notes,
      }).where(eq(stockOpnameItems.id, item.id));
    }

    // Return updated session
    const updated = await db.query.stockOpnameSessions.findFirst({
      where: eq(stockOpnameSessions.id, id),
      with: { items: true },
    });

    await createAuditLog(req, 'stock_opname.items_updated', `Updated ${body.items.length} items in session ${id}`);

    return reply.send({
      success: true,
      data: updated,
      message: 'Items updated successfully',
    });
  });

  // ─── Delete session ────────────────────────────────────────
  app.delete('/api/stock-opname/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const session = await db.select().from(stockOpnameSessions).where(eq(stockOpnameSessions.id, id)).limit(1);
    if (!session.length) {
      return reply.status(404).send({ success: false, error: 'Stock opname session not found' });
    }

    await db.delete(stockOpnameSessions).where(eq(stockOpnameSessions.id, id));
    await createAuditLog(req, 'stock_opname.deleted', `Session "${session[0].name}" deleted`);

    return reply.send({ success: true, message: 'Stock opname session deleted' });
  });

  // ─── Export to Excel ───────────────────────────────────────
  app.get('/api/stock-opname/:id/export', { preHandler: [requireRole('developer', 'admin', 'cashier')] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const session = await db.query.stockOpnameSessions.findFirst({
      where: eq(stockOpnameSessions.id, id),
      with: { items: true },
    });

    if (!session) {
      return reply.status(404).send({ success: false, error: 'Stock opname session not found' });
    }

    // Fetch stock-opname-specific categories (kelompok bahan)
    const allCategories = await db.select().from(stockOpnameCategories).orderBy(asc(stockOpnameCategories.sortOrder), asc(stockOpnameCategories.name));
    const categoryNameMap = new Map<string, string>();
    allCategories.forEach((c) => categoryNameMap.set(c.id, c.name));

    // ── Collect all distinct "barang masuk" dates across all items, sorted ──
    const dateSet = new Set<string>();
    session.items.forEach((item) => {
      const entries = (item.stockInEntries as StockInEntry[]) || [];
      entries.forEach((e) => { if (e.date) dateSet.add(e.date); });
    });
    const sortedDates = Array.from(dateSet).sort();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Stok Opname', {
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      },
    });

    const dateStr = new Date(session.date).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // Column layout: No | Nama Bahan | Sat | Qty Awal | [tanggal...] | Total Stok | Stok Fisik | Terpakai | Selisih | Keterangan
    const fixedColsBefore = 4; // No, Nama, Sat, Qty Awal
    const dateColCount = sortedDates.length;
    const totalCols = fixedColsBefore + dateColCount + 5; // + Total Stok, Stok Fisik, Terpakai, Selisih, Keterangan

    const colLetter = (n: number) => {
      let s = '';
      while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - m) / 26);
      }
      return s;
    };
    const lastColLetter = colLetter(totalCols);

    // ── Title row ──
    sheet.mergeCells(`A1:${lastColLetter}1`);
    const titleCell = sheet.getCell('A1');
    titleCell.value = `${session.name} — ${dateStr}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    if (session.notes) {
      sheet.mergeCells(`A2:${lastColLetter}2`);
      const notesCell = sheet.getCell('A2');
      notesCell.value = `Catatan: ${session.notes}`;
      notesCell.font = { italic: true, size: 10 };
    }

    const headerRowNum = session.notes ? 4 : 3;
    const barangMasukStartCol = fixedColsBefore + 1;
    const barangMasukEndCol = fixedColsBefore + dateColCount;
    const totalStokCol = barangMasukEndCol + 1;
    const stokFisikCol = totalStokCol + 1;
    const terpakaiCol = stokFisikCol + 1;
    const selisihCol = terpakaiCol + 1;
    const keteranganCol = selisihCol + 1;

    // ── Header row 1: group labels ──
    const headerRow1 = sheet.getRow(headerRowNum);
    ['No', 'NAMA BAHAN UTAMA', 'SAT', 'QTY AWAL'].forEach((label, i) => {
      sheet.mergeCells(headerRowNum, i + 1, headerRowNum + 1, i + 1);
      const cell = headerRow1.getCell(i + 1);
      cell.value = label;
    });
    if (dateColCount > 0) {
      sheet.mergeCells(headerRowNum, barangMasukStartCol, headerRowNum, barangMasukEndCol);
      headerRow1.getCell(barangMasukStartCol).value = 'BARANG MASUK (TANGGAL)';
    }
    [
      [totalStokCol, 'TOTAL STOK'],
      [stokFisikCol, 'STOK FISIK\n(RIIL)'],
      [terpakaiCol, 'TERPAKAI'],
      [selisihCol, 'SELISIH'],
      [keteranganCol, 'KETERANGAN\n/ RUSAK'],
    ].forEach(([col, label]) => {
      sheet.mergeCells(headerRowNum, col as number, headerRowNum + 1, col as number);
      headerRow1.getCell(col as number).value = label;
    });

    // ── Header row 2: individual dates ──
    const headerRow2 = sheet.getRow(headerRowNum + 1);
    sortedDates.forEach((d, i) => {
      const day = new Date(d).getDate();
      headerRow2.getCell(barangMasukStartCol + i).value = day;
    });

    // Style both header rows
    [headerRow1, headerRow2].forEach((row) => {
      for (let c = 1; c <= totalCols; c++) {
        const cell = row.getCell(c);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B050' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      }
    });
    headerRow1.height = 22;
    headerRow2.height = 18;

    // ── Column widths ──
    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 30;
    sheet.getColumn(3).width = 8;
    sheet.getColumn(4).width = 11;
    for (let i = 0; i < dateColCount; i++) sheet.getColumn(barangMasukStartCol + i).width = 7;
    sheet.getColumn(totalStokCol).width = 11;
    sheet.getColumn(stokFisikCol).width = 11;
    sheet.getColumn(terpakaiCol).width = 11;
    sheet.getColumn(selisihCol).width = 10;
    sheet.getColumn(keteranganCol).width = 20;

    // ── Group items by stock-opname category ──
    const itemsGrouped: Record<string, typeof session.items> = {};
    session.items.forEach((item) => {
      const catName = (item.categoryId && categoryNameMap.get(item.categoryId)) || 'Tanpa Kategori';
      if (!itemsGrouped[catName]) itemsGrouped[catName] = [];
      itemsGrouped[catName].push(item);
    });

    let currentRowNum = headerRowNum + 2;
    let categoryCharIndex = 65; // 'A'

    Object.entries(itemsGrouped).forEach(([categoryName, groupItems]) => {
      const catRow = sheet.getRow(currentRowNum);
      const catLetter = String.fromCharCode(categoryCharIndex++);
      catRow.getCell(1).value = catLetter;
      catRow.getCell(2).value = categoryName;
      sheet.mergeCells(currentRowNum, 2, currentRowNum, totalCols);

      catRow.eachCell((cell) => {
        cell.font = { bold: true, italic: true, color: { argb: 'FF004B49' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00E5FF' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
      catRow.height = 20;
      currentRowNum++;

      groupItems.forEach((item, idx) => {
        const row = sheet.getRow(currentRowNum);
        const entries = (item.stockInEntries as StockInEntry[]) || [];
        const entryMap = new Map(entries.map((e) => [e.date, e.qty]));

        // Column letters for formula calculations
        const totColL = colLetter(totalStokCol);
        const stokFisikColL = colLetter(stokFisikCol);
        const startMasukL = dateColCount > 0 ? colLetter(barangMasukStartCol) : '';
        const endMasukL = dateColCount > 0 ? colLetter(barangMasukEndCol) : '';

        row.getCell(1).value = idx + 1;
        row.getCell(2).value = item.productName;
        row.getCell(3).value = item.unit || 'Pcs';
        row.getCell(4).value = item.stockStart || 0;

        sortedDates.forEach((d, i) => {
          const qty = entryMap.get(d);
          if (qty !== undefined) row.getCell(barangMasukStartCol + i).value = qty;
        });

        const totalStokVal = (item.stockStart || 0) + sumEntries(item.stockInEntries as StockInEntry[]);
        const stokRealVal = item.stockReal || 0;
        const terpakaiVal = totalStokVal - stokRealVal;
        const selisihVal = stokRealVal - totalStokVal;

        // Dynamic Excel Formulas (with result for Excel Protected View compatibility)
        if (dateColCount > 0) {
          row.getCell(totalStokCol).value = { formula: `D${currentRowNum}+SUM(${startMasukL}${currentRowNum}:${endMasukL}${currentRowNum})`, result: totalStokVal };
        } else {
          row.getCell(totalStokCol).value = { formula: `D${currentRowNum}`, result: totalStokVal };
        }

        row.getCell(stokFisikCol).value = stokRealVal;
        row.getCell(terpakaiCol).value = { formula: `${totColL}${currentRowNum}-${stokFisikColL}${currentRowNum}`, result: terpakaiVal };
        row.getCell(selisihCol).value = { formula: `${stokFisikColL}${currentRowNum}-${totColL}${currentRowNum}`, result: selisihVal };
        row.getCell(keteranganCol).value = item.notes || (item.waste ? `Rusak: ${item.waste}` : '-');

        for (let c = 1; c <= totalCols; c++) {
          const cell = row.getCell(c);
          cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
          if (c === totalStokCol || c === stokFisikCol || c === terpakaiCol || c === selisihCol) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBFBFBF' } };
          }
          if (c === 1 || c === 3) {
            cell.alignment = { horizontal: 'center' };
          } else if (c >= 4 && c <= keteranganCol - 1) {
            cell.alignment = { horizontal: 'right' };
            cell.numFmt = '#,##0';
          } else {
            cell.alignment = { horizontal: 'left' };
          }
        }
        currentRowNum++;
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `stok-opname-${session.name.replace(/\s+/g, '-').toLowerCase()}-${dateStr.replace(/\s+/g, '-')}.xlsx`;

    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(Buffer.from(buffer as ArrayBuffer));
  });
}

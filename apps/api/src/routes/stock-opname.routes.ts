// ============================================================
// POS Yoga — Stock Opname (Physical Inventory Count) Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { stockOpnameSessions, stockOpnameItems, products } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';
import ExcelJS from 'exceljs';

export async function stockOpnameRoutes(app: FastifyInstance) {
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
      productName: product.name,
      unit: 'Pcs',
      stockStart: product.stock,
      stockIn: 0,
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
  app.get('/api/stock-opname', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
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
  app.get('/api/stock-opname/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
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

  // ─── Bulk update items ─────────────────────────────────────
  app.put('/api/stock-opname/:id/items', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      items: Array<{
        id: string;
        unit?: string;
        stockStart?: number;
        stockIn?: number;
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
      const stockIn = item.stockIn ?? current.stockIn;
      const stockReal = item.stockReal ?? current.stockReal;
      const usage = stockStart + stockIn - stockReal;

      await db.update(stockOpnameItems).set({
        unit: item.unit ?? current.unit,
        stockStart,
        stockIn,
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
  app.get('/api/stock-opname/:id/export', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const session = await db.query.stockOpnameSessions.findFirst({
      where: eq(stockOpnameSessions.id, id),
      with: { items: true },
    });

    if (!session) {
      return reply.status(404).send({ success: false, error: 'Stock opname session not found' });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Stok Opname');

    // Format date for title
    const dateStr = new Date(session.date).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    // ── Title row ──
    sheet.mergeCells('A1:H1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `${session.name} — ${dateStr}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 30;

    // ── Notes row (optional) ──
    if (session.notes) {
      sheet.mergeCells('A2:H2');
      const notesCell = sheet.getCell('A2');
      notesCell.value = `Catatan: ${session.notes}`;
      notesCell.font = { italic: true, size: 10 };
    }

    // ── Header row ──
    const headerRowNum = session.notes ? 4 : 3;
    const headers = [
      'No',
      'Nama Bahan Utama',
      'SAT',
      'Stok Awal (Pagi)',
      'Barang Masuk',
      'Stok Fisik Riil (Malam)',
      'Pemakaian Terhitung',
      'Keterangan / Rusak (Waste)',
    ];

    const headerRow = sheet.getRow(headerRowNum);
    headers.forEach((header, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF009688' }, // Teal/cyan
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    headerRow.height = 28;

    // ── Column widths ──
    sheet.getColumn(1).width = 5;   // No
    sheet.getColumn(2).width = 30;  // Nama Bahan
    sheet.getColumn(3).width = 8;   // SAT
    sheet.getColumn(4).width = 16;  // Stok Awal
    sheet.getColumn(5).width = 14;  // Barang Masuk
    sheet.getColumn(6).width = 22;  // Stok Fisik Riil
    sheet.getColumn(7).width = 20;  // Pemakaian
    sheet.getColumn(8).width = 24;  // Waste

    // ── Data rows ──
    session.items.forEach((item, idx) => {
      const rowNum = headerRowNum + 1 + idx;
      const row = sheet.getRow(rowNum);

      // Column letters for formula: D=StokAwal, E=BarangMasuk, F=StokRiil
      row.getCell(1).value = idx + 1;                    // No
      row.getCell(2).value = item.productName;            // Nama Bahan
      row.getCell(3).value = item.unit;                   // SAT
      row.getCell(4).value = item.stockStart;             // Stok Awal
      row.getCell(5).value = item.stockIn;                // Barang Masuk
      row.getCell(6).value = item.stockReal;              // Stok Fisik Riil
      row.getCell(7).value = { formula: `D${rowNum}+E${rowNum}-F${rowNum}` }; // Pemakaian
      row.getCell(8).value = item.waste;                  // Waste

      // Borders for data cells
      for (let c = 1; c <= 8; c++) {
        const cell = row.getCell(c);
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
        if (c >= 3) {
          cell.alignment = { horizontal: 'center' };
        }
      }
    });

    // Generate buffer and send
    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `stok-opname-${session.name.replace(/\s+/g, '-').toLowerCase()}-${dateStr.replace(/\s+/g, '-')}.xlsx`;

    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(Buffer.from(buffer as ArrayBuffer));
  });
}

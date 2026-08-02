// ============================================================
// POS Yoga — Excel Export Routes
// ============================================================

import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import {
  transactions, transactionItems, user, expenses,
  products, categories, productVariants, categoryOptionGroups, categoryOptions
} from '../db/schema.js';
import { eq, gte, lte, and, desc } from 'drizzle-orm';
import { requireRole } from '../middleware/auth.middleware.js';
import ExcelJS from 'exceljs';

export async function exportRoutes(app: FastifyInstance) {
  // Helper for cell styling
  const styleHeaderCell = (cell: ExcelJS.Cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF009688' }, // Teal
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  };

  const styleDataCell = (cell: ExcelJS.Cell, align: 'left' | 'center' | 'right' = 'left') => {
    cell.alignment = { horizontal: align, vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  };

  // ─── 1. Export Transactions ─────────────────────────────────
  app.get('/api/export/transactions', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { from, to } = req.query as { from?: string; to?: string };

    const startDate = from ? new Date(`${from}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
    const endDate = to ? new Date(`${to}T23:59:59`) : new Date(new Date().setHours(23, 59, 59, 999));

    // Fetch transactions
    const txList = await db.select({
      id: transactions.id,
      invoiceNo: transactions.invoiceNo,
      createdAt: transactions.createdAt,
      cashierName: user.name,
      orderType: transactions.orderType,
      tableNo: transactions.tableNo,
      subtotal: transactions.subtotal,
      discount: transactions.discount,
      total: transactions.total,
      paymentMethod: transactions.paymentMethod,
      status: transactions.status,
    })
      .from(transactions)
      .leftJoin(user, eq(transactions.userId, user.id))
      .where(and(gte(transactions.createdAt, startDate), lte(transactions.createdAt, endDate)))
      .orderBy(desc(transactions.createdAt));

    // Fetch transaction items
    const txIds = txList.map((t) => t.id);
    let itemsList: any[] = [];
    if (txIds.length > 0) {
      itemsList = await db.select({
        transactionId: transactionItems.transactionId,
        invoiceNo: transactions.invoiceNo,
        createdAt: transactions.createdAt,
        productName: transactionItems.productName,
        variantName: transactionItems.variantName,
        qty: transactionItems.qty,
        price: transactionItems.price,
        subtotal: transactionItems.subtotal,
        note: transactionItems.note,
      })
        .from(transactionItems)
        .leftJoin(transactions, eq(transactionItems.transactionId, transactions.id))
        .where(and(gte(transactions.createdAt, startDate), lte(transactions.createdAt, endDate)))
        .orderBy(desc(transactions.createdAt));
    }

    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Ringkasan Transaksi
    const s1 = workbook.addWorksheet('Ringkasan Transaksi');
    s1.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'No Invoice', key: 'invoiceNo', width: 22 },
      { header: 'Tanggal', key: 'date', width: 14 },
      { header: 'Jam', key: 'time', width: 10 },
      { header: 'Kasir', key: 'cashier', width: 18 },
      { header: 'Tipe Pesanan', key: 'orderType', width: 16 },
      { header: 'Meja', key: 'tableNo', width: 10 },
      { header: 'Subtotal (Rp)', key: 'subtotal', width: 16 },
      { header: 'Diskon (Rp)', key: 'discount', width: 16 },
      { header: 'Total (Rp)', key: 'total', width: 16 },
      { header: 'Metode Bayar', key: 'paymentMethod', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
    ];

    s1.getRow(1).eachCell((cell) => styleHeaderCell(cell));

    let totalSum = 0;
    txList.forEach((t, i) => {
      const d = new Date(t.createdAt);
      const row = s1.addRow({
        no: i + 1,
        invoiceNo: t.invoiceNo,
        date: d.toLocaleDateString('id-ID'),
        time: d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        cashier: t.cashierName || '-',
        orderType: t.orderType === 'take_away' ? 'Take Away' : 'Dine In',
        tableNo: t.tableNo || '-',
        subtotal: Number(t.subtotal) || 0,
        discount: Number(t.discount) || 0,
        total: Number(t.total) || 0,
        paymentMethod: (t.paymentMethod || 'cash').toUpperCase(),
        status: (t.status || 'completed').toUpperCase(),
      });

      totalSum += Number(t.total) || 0;

      row.eachCell((cell, colNumber) => {
        const align = [1, 3, 4, 6, 7, 11, 12].includes(colNumber) ? 'center' : [8, 9, 10].includes(colNumber) ? 'right' : 'left';
        styleDataCell(cell, align);
        if ([8, 9, 10].includes(colNumber)) {
          cell.numFmt = '#,##0';
        }
      });
    });

    // Total summary row
    if (txList.length > 0) {
      const totalRow = s1.addRow({
        no: '',
        invoiceNo: 'TOTAL',
        date: '',
        time: '',
        cashier: '',
        orderType: '',
        tableNo: '',
        subtotal: '',
        discount: '',
        total: totalSum,
        paymentMethod: '',
        status: '',
      });
      totalRow.eachCell((cell, colNumber) => {
        styleHeaderCell(cell);
        if (colNumber === 10) {
          cell.numFmt = '#,##0';
        }
      });
    }

    // Sheet 2: Detail Item
    const s2 = workbook.addWorksheet('Detail Item Transaksi');
    s2.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'No Invoice', key: 'invoiceNo', width: 22 },
      { header: 'Tanggal', key: 'date', width: 14 },
      { header: 'Nama Produk', key: 'productName', width: 28 },
      { header: 'Varian / Addon', key: 'variantName', width: 24 },
      { header: 'Qty', key: 'qty', width: 8 },
      { header: 'Harga Satuan (Rp)', key: 'price', width: 18 },
      { header: 'Subtotal (Rp)', key: 'subtotal', width: 18 },
      { header: 'Catatan Item', key: 'note', width: 24 },
    ];

    s2.getRow(1).eachCell((cell) => styleHeaderCell(cell));

    itemsList.forEach((it, i) => {
      const d = it.createdAt ? new Date(it.createdAt) : new Date();
      const row = s2.addRow({
        no: i + 1,
        invoiceNo: it.invoiceNo || '-',
        date: d.toLocaleDateString('id-ID'),
        productName: it.productName,
        variantName: it.variantName || '-',
        qty: it.qty,
        price: Number(it.price) || 0,
        subtotal: Number(it.subtotal) || 0,
        note: it.note || '-',
      });

      row.eachCell((cell, colNumber) => {
        const align = [1, 3, 6].includes(colNumber) ? 'center' : [7, 8].includes(colNumber) ? 'right' : 'left';
        styleDataCell(cell, align);
        if ([7, 8].includes(colNumber)) {
          cell.numFmt = '#,##0';
        }
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const dateTag = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="transaksi_${dateTag}.xlsx"`)
      .send(Buffer.from(buffer as ArrayBuffer));
  });

  // ─── 2. Export Expenses ────────────────────────────────────
  app.get('/api/export/expenses', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { from, to } = req.query as { from?: string; to?: string };

    const startDate = from ? new Date(`${from}T00:00:00`) : new Date(new Date().setHours(0, 0, 0, 0));
    const endDate = to ? new Date(`${to}T23:59:59`) : new Date(new Date().setHours(23, 59, 59, 999));

    const expList = await db.select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      date: expenses.date,
      recordedBy: user.name,
    })
      .from(expenses)
      .leftJoin(user, eq(expenses.userId, user.id))
      .where(and(gte(expenses.date, startDate), lte(expenses.date, endDate)))
      .orderBy(desc(expenses.date));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pengeluaran Operasional');

    sheet.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Tanggal', key: 'date', width: 14 },
      { header: 'Jam', key: 'time', width: 10 },
      { header: 'Deskripsi Pengeluaran', key: 'description', width: 35 },
      { header: 'Jumlah (Rp)', key: 'amount', width: 18 },
      { header: 'Dicatat Oleh', key: 'recordedBy', width: 20 },
    ];

    sheet.getRow(1).eachCell((cell) => styleHeaderCell(cell));

    let sumExpense = 0;
    expList.forEach((e, i) => {
      const d = new Date(e.date);
      const amt = Number(e.amount) || 0;
      sumExpense += amt;

      const row = sheet.addRow({
        no: i + 1,
        date: d.toLocaleDateString('id-ID'),
        time: d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        description: e.description,
        amount: amt,
        recordedBy: e.recordedBy || '-',
      });

      row.eachCell((cell, colNumber) => {
        const align = [1, 2, 3].includes(colNumber) ? 'center' : colNumber === 5 ? 'right' : 'left';
        styleDataCell(cell, align);
        if (colNumber === 5) cell.numFmt = '#,##0';
      });
    });

    if (expList.length > 0) {
      const totalRow = sheet.addRow({
        no: '',
        date: '',
        time: '',
        description: 'TOTAL PENGELUARAN',
        amount: sumExpense,
        recordedBy: '',
      });
      totalRow.eachCell((cell, colNumber) => {
        styleHeaderCell(cell);
        if (colNumber === 5) cell.numFmt = '#,##0';
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const dateTag = from && to ? `${from}_to_${to}` : new Date().toISOString().slice(0, 10);
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="pengeluaran_${dateTag}.xlsx"`)
      .send(Buffer.from(buffer as ArrayBuffer));
  });

  // ─── 3. Export Menu & Options ──────────────────────────────
  app.get('/api/export/menu', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const prodList = await db.select({
      id: products.id,
      name: products.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      sku: products.sku,
      barcode: products.barcode,
      price: products.price,
      cost: products.cost,
      stock: products.stock,
      isActive: products.isActive,
    })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id));

    const varList = await db.select({
      productId: productVariants.productId,
      productName: products.name,
      variantName: productVariants.name,
      additionalPrice: productVariants.additionalPrice,
    })
      .from(productVariants)
      .leftJoin(products, eq(productVariants.productId, products.id));

    const optList = await db.select({
      categoryId: categoryOptionGroups.categoryId,
      categoryName: categories.name,
      groupName: categoryOptionGroups.name,
      optionName: categoryOptions.name,
      price: categoryOptions.price,
      isRequired: categoryOptionGroups.isRequired,
      isMultiple: categoryOptionGroups.isMultiple,
    })
      .from(categoryOptions)
      .leftJoin(categoryOptionGroups, eq(categoryOptions.groupId, categoryOptionGroups.id))
      .leftJoin(categories, eq(categoryOptionGroups.categoryId, categories.id));

    // Group variants by productId
    const variantsByProduct: Record<string, string[]> = {};
    varList.forEach((v) => {
      if (!v.productId) return;
      if (!variantsByProduct[v.productId]) variantsByProduct[v.productId] = [];
      const addPrice = Number(v.additionalPrice) || 0;
      const priceStr = addPrice > 0 ? ` (+Rp ${addPrice.toLocaleString('id-ID')})` : '';
      variantsByProduct[v.productId].push(`${v.variantName}${priceStr}`);
    });

    // Group options by categoryId
    const optionsByCategory: Record<string, string[]> = {};
    optList.forEach((o) => {
      if (!o.categoryId) return;
      if (!optionsByCategory[o.categoryId]) optionsByCategory[o.categoryId] = [];
      const price = Number(o.price) || 0;
      const priceStr = price > 0 ? ` (+Rp ${price.toLocaleString('id-ID')})` : '';
      optionsByCategory[o.categoryId].push(`${o.groupName}: ${o.optionName}${priceStr}`);
    });

    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Daftar Produk + Varian & Sub Varian
    const s1 = workbook.addWorksheet('Daftar Produk');
    s1.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Nama Produk', key: 'name', width: 28 },
      { header: 'Kategori', key: 'category', width: 18 },
      { header: 'Varian Produk', key: 'variants', width: 32 },
      { header: 'Sub Varian / Addon Kategori', key: 'options', width: 40 },
      { header: 'SKU', key: 'sku', width: 14 },
      { header: 'Barcode', key: 'barcode', width: 16 },
      { header: 'Harga Jual (Rp)', key: 'price', width: 16 },
      { header: 'Harga Modal (Rp)', key: 'cost', width: 16 },
      { header: 'Stok', key: 'stock', width: 10 },
      { header: 'Status', key: 'status', width: 12 },
    ];
    s1.getRow(1).eachCell((cell) => styleHeaderCell(cell));

    prodList.forEach((p, i) => {
      const productVars = variantsByProduct[p.id]?.join(', ') || '-';
      const catOpts = (p.categoryId && optionsByCategory[p.categoryId]) ? optionsByCategory[p.categoryId].join('; ') : '-';

      const row = s1.addRow({
        no: i + 1,
        name: p.name,
        category: p.categoryName || '-',
        variants: productVars,
        options: catOpts,
        sku: p.sku || '-',
        barcode: p.barcode || '-',
        price: Number(p.price) || 0,
        cost: Number(p.cost) || 0,
        stock: p.stock,
        status: p.isActive ? 'Aktif' : 'Non-Aktif',
      });

      row.eachCell((cell, colNumber) => {
        const align = [1, 6, 7, 10, 11].includes(colNumber) ? 'center' : [8, 9].includes(colNumber) ? 'right' : 'left';
        styleDataCell(cell, align);
        if ([8, 9].includes(colNumber)) cell.numFmt = '#,##0';
      });
    });

    // Sheet 2: Detail Varian Produk
    const s2 = workbook.addWorksheet('Varian Produk');
    s2.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Nama Produk', key: 'productName', width: 28 },
      { header: 'Nama Varian', key: 'variantName', width: 22 },
      { header: 'Harga Tambahan (Rp)', key: 'additionalPrice', width: 20 },
    ];
    s2.getRow(1).eachCell((cell) => styleHeaderCell(cell));

    varList.forEach((v, i) => {
      const row = s2.addRow({
        no: i + 1,
        productName: v.productName || '-',
        variantName: v.variantName,
        additionalPrice: Number(v.additionalPrice) || 0,
      });
      row.eachCell((cell, colNumber) => {
        const align = colNumber === 1 ? 'center' : colNumber === 4 ? 'right' : 'left';
        styleDataCell(cell, align);
        if (colNumber === 4) cell.numFmt = '#,##0';
      });
    });

    // Sheet 3: Opsi / Addon Kategori
    const s3 = workbook.addWorksheet('Opsi & Addon Kategori');
    s3.columns = [
      { header: 'No', key: 'no', width: 6 },
      { header: 'Kategori', key: 'categoryName', width: 20 },
      { header: 'Grup Opsi', key: 'groupName', width: 22 },
      { header: 'Nama Opsi', key: 'optionName', width: 22 },
      { header: 'Harga Opsi (Rp)', key: 'price', width: 16 },
      { header: 'Wajib Select', key: 'isRequired', width: 14 },
      { header: 'Multi Select', key: 'isMultiple', width: 14 },
    ];
    s3.getRow(1).eachCell((cell) => styleHeaderCell(cell));

    optList.forEach((o, i) => {
      const row = s3.addRow({
        no: i + 1,
        categoryName: o.categoryName || '-',
        groupName: o.groupName || '-',
        optionName: o.optionName,
        price: Number(o.price) || 0,
        isRequired: o.isRequired ? 'Ya' : 'Tidak',
        isMultiple: o.isMultiple ? 'Ya' : 'Tidak',
      });
      row.eachCell((cell, colNumber) => {
        const align = [1, 6, 7].includes(colNumber) ? 'center' : colNumber === 5 ? 'right' : 'left';
        styleDataCell(cell, align);
        if (colNumber === 5) cell.numFmt = '#,##0';
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', 'attachment; filename="menu_produk.xlsx"')
      .send(Buffer.from(buffer as ArrayBuffer));
  });
}

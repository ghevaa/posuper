// ============================================================
// POS Yoga — Database Seed
// ============================================================

import 'dotenv/config';
import { db, pool } from './index.js';
import * as schema from './schema.js';
import { nanoid } from 'nanoid';
import { DEFAULT_SETTINGS } from '@pos-yoga/config';

async function seed() {
  console.log('🌱 Seeding database...');

  // --- Settings ---
  console.log('  → Settings');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(schema.settings).values({
      id: nanoid(),
      key,
      value,
    }).onConflictDoNothing();
  }

  // --- Categories ---
  console.log('  → Categories');
  const categoryIds = {
    makanan: nanoid(),
    minuman: nanoid(),
    snack: nanoid(),
    dessert: nanoid(),
  };

  await db.insert(schema.categories).values([
    { id: categoryIds.makanan, name: 'Makanan', icon: '🍔', color: '#ef4444' },
    { id: categoryIds.minuman, name: 'Minuman', icon: '☕', color: '#3b82f6' },
    { id: categoryIds.snack, name: 'Snack', icon: '🍿', color: '#f59e0b' },
    { id: categoryIds.dessert, name: 'Dessert', icon: '🍰', color: '#ec4899' },
  ]).onConflictDoNothing();

  // --- Products ---
  console.log('  → Products');
  const sampleProducts = [
    { name: 'Nasi Goreng', price: '15000', cost: '8000', stock: 100, barcode: '8991001001', categoryId: categoryIds.makanan },
    { name: 'Mie Goreng', price: '13000', cost: '7000', stock: 100, barcode: '8991001002', categoryId: categoryIds.makanan },
    { name: 'Ayam Bakar', price: '25000', cost: '15000', stock: 50, barcode: '8991001003', categoryId: categoryIds.makanan },
    { name: 'Burger Beef', price: '28000', cost: '16000', stock: 40, barcode: '8991001004', categoryId: categoryIds.makanan },
    { name: 'Pizza Margherita', price: '35000', cost: '18000', stock: 30, barcode: '8991001005', categoryId: categoryIds.makanan },
    { name: 'Es Teh Manis', price: '5000', cost: '2000', stock: 200, barcode: '8991002001', categoryId: categoryIds.minuman },
    { name: 'Kopi Hitam', price: '8000', cost: '3000', stock: 200, barcode: '8991002002', categoryId: categoryIds.minuman },
    { name: 'Jus Jeruk', price: '12000', cost: '5000', stock: 100, barcode: '8991002003', categoryId: categoryIds.minuman },
    { name: 'Cappuccino', price: '18000', cost: '7000', stock: 100, barcode: '8991002004', categoryId: categoryIds.minuman },
    { name: 'Matcha Latte', price: '20000', cost: '8000', stock: 80, barcode: '8991002005', categoryId: categoryIds.minuman },
    { name: 'Kentang Goreng', price: '10000', cost: '4000', stock: 100, barcode: '8991003001', categoryId: categoryIds.snack },
    { name: 'Cireng', price: '8000', cost: '3000', stock: 100, barcode: '8991003002', categoryId: categoryIds.snack },
    { name: 'Pudding Coklat', price: '12000', cost: '5000', stock: 50, barcode: '8991004001', categoryId: categoryIds.dessert },
    { name: 'Brownies', price: '15000', cost: '7000', stock: 50, barcode: '8991004002', categoryId: categoryIds.dessert },
  ];

  for (const p of sampleProducts) {
    await db.insert(schema.products).values({
      id: nanoid(),
      name: p.name,
      price: p.price,
      cost: p.cost,
      stock: p.stock,
      barcode: p.barcode,
      categoryId: p.categoryId,
      isActive: true,
    }).onConflictDoNothing();
  }

  // --- Printers ---
  console.log('  → Printers');
  await db.insert(schema.printers).values([
    { id: nanoid(), name: 'Printer Struk', type: 'receipt', connectionType: 'usb', isDefault: true, isActive: true },
    { id: nanoid(), name: 'Printer Dapur', type: 'kitchen', connectionType: 'usb', isDefault: true, isActive: true },
  ]).onConflictDoNothing();

  console.log('✅ Seed complete!');
  console.log('');
  console.log('📌 Default developer account akan dibuat saat pertama kali register via API.');
  console.log('   POST /auth/sign-up/email dengan { name, email, password, role: "developer" }');

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

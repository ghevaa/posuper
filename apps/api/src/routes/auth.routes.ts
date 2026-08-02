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
import { eq, ne } from 'drizzle-orm';

export async function authRoutes(app: FastifyInstance) {
  // Better Auth catch-all handler
  app.all('/auth/*', async (req, reply) => {
    const url = new URL(req.url, `http://${req.hostname}`);
    const response = await auth.handler(new Request(url.toString(), {
      method: req.method,
      headers: req.headers as any,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    }));

    // Forward response headers
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

  // List all users (admin+) - Excludes anonymous developer account (ghedev@gmail.com)
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
        body: {
          name,
          email,
          password,
        },
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

      const tempEmail = `temp_${Date.now()}@posyoga.local`;
      const tempSignUp = await auth.api.signUpEmail({
        body: { name: 'temp', email: tempEmail, password: newPassword },
      });

      if (tempSignUp?.user) {
        const tempAccount = await db.select().from(account).where(eq(account.userId, tempSignUp.user.id)).limit(1);
        if (tempAccount[0]?.password) {
          await db.update(account).set({ password: tempAccount[0].password }).where(eq(account.userId, id));
        }
        await db.delete(account).where(eq(account.userId, tempSignUp.user.id));
        await db.delete(user).where(eq(user.id, tempSignUp.user.id));
      }

      await createAuditLog(req, 'user.password_changed', `Changed password for ${targetUser.email}`);
      return reply.send({ success: true, message: 'Password pengguna berhasil diperbarui' });
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message || 'Gagal memperbarui password' });
    }
  });

  // Delete user (developer & admin)
  app.delete('/api/users/:id', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const currentUser = (req as any).user;

    if (id === currentUser.id) {
      return reply.status(400).send({ success: false, error: 'Tidak dapat menghapus akun Anda sendiri' });
    }

    const targetUsers = await db.select().from(user).where(eq(user.id, id)).limit(1);
    const targetUser = targetUsers[0];
    if (!targetUser) {
      return reply.status(404).send({ success: false, error: 'Pengguna tidak ditemukan' });
    }

    if (targetUser.email === 'ghedev@gmail.com') {
      return reply.status(400).send({ success: false, error: 'Akun developer sistem tidak dapat dihapus' });
    }

    if (currentUser.role === 'admin' && (targetUser.role === 'developer' || targetUser.role === 'admin')) {
      return reply.status(400).send({ success: false, error: 'Admin hanya dapat menghapus akun Kasir atau Dapur' });
    }

    try {
      await db.delete(account).where(eq(account.userId, id)).catch(() => {});
      await db.delete(session).where(eq(session.userId, id)).catch(() => {});

      await db.update(transactions).set({ userId: currentUser.id }).where(eq(transactions.userId, id)).catch(() => {});
      await db.delete(cashShifts).where(eq(cashShifts.userId, id)).catch(() => {});
      await db.delete(expenses).where(eq(expenses.userId, id)).catch(() => {});
      await db.delete(stockOpnameSessions).where(eq(stockOpnameSessions.userId, id)).catch(() => {});
      await db.delete(logs).where(eq(logs.userId, id)).catch(() => {});

      await db.delete(user).where(eq(user.id, id));

      await createAuditLog(req, 'user.deleted', `User ${targetUser.email} deleted`);
      return reply.send({ success: true, message: 'Pengguna berhasil dihapus' });
    } catch (err: any) {
      console.error('Delete user error:', err);
      return reply.status(400).send({ success: false, error: err.message || 'Gagal menghapus pengguna' });
    }
  });

  // Reset all menu & transaction data to 0 (developer & admin)
  app.post('/api/dev/reset-database', { preHandler: [requireRole('developer', 'admin')] }, async (req, reply) => {
    try {
      await db.delete(transactionItems);
      await db.delete(payments);
      await db.delete(transactions);
      await db.delete(cashShifts);
      await db.delete(expenses);
      await db.delete(stockOpnameItems);
      await db.delete(stockOpnameSessions);
      await db.delete(customers);
      await db.delete(logs);

      await db.delete(categoryOptions);
      await db.delete(categoryOptionGroups);
      await db.delete(productVariants);
      await db.delete(products);
      await db.delete(categories);

      const nonDevUsers = await db.select().from(user).where(ne(user.role, 'developer'));
      for (const u of nonDevUsers) {
        await db.delete(account).where(eq(account.userId, u.id)).catch(() => {});
        await db.delete(session).where(eq(session.userId, u.id)).catch(() => {});
        await db.delete(user).where(eq(user.id, u.id)).catch(() => {});
      }

      // Ensure ghedev@gmail.com exists
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

      await createAuditLog(req, 'system.reset', 'Reset all menu & transaction data to 0');
      return reply.send({ success: true, message: 'Seluruh data menu, transaksi, dan akun kasir telah direset ke 0!' });
    } catch (err: any) {
      console.error('Reset DB failed:', err);
      return reply.status(400).send({ success: false, error: err.message || 'Gagal mereset database' });
    }
  });
}

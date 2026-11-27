
import { Router } from 'express';
import { getRouteHandlerChain } from '../../../controllers/routeHandlers.js';
import { pool } from '../../../config/db.js';
import { hashPassword } from '../../../services/authService.js';
import { requireRole } from '../../../middleware/auth.js';
import { wrap, httpError, isBlank } from '../../../utils/http.js';
import { logActivity } from '../../../services/activityService.js';

function checkPassword(value) {
  if (isBlank(value) || String(value).length < 6) {
    throw httpError(400, 'The password needs at least 6 characters.');
  }
  return String(value);
}

const router = Router();
router.use(requireRole('owner'));

const ROLES = ['cashier', 'kitchen', 'inventory', 'owner'];
const COLUMNS = 'id, full_name, username, role, is_active, created_at';

function checkName(value) {
  const name = String(value || '').trim();
  if (name.length < 2) {
    throw httpError(400, 'Enter the employee’s full name.');
  }
  return name;
}

function checkRole(value) {
  if (!ROLES.includes(value)) throw httpError(400, 'Choose a role.');
  return value;
}

// Get all user accounts
router.get(
  '/',
  wrap(async (req, res) => {
    const [rows] = await pool.query(
      `SELECT ${COLUMNS} FROM users ORDER BY is_active DESC, role, full_name`,
    );
    res.json(rows);
  }),
);

// Create a user account
router.post(
  '/',
  wrap(async (req, res) => {
    const body = req.body || {};
    const full_name = checkName(body.full_name);
    const role = checkRole(body.role);
    const username = String(body.username || '').trim().toLowerCase();

    if (!/^[a-z0-9._]{3,30}$/.test(username)) {
      throw httpError(
        400,
        'Username must be 3–30 characters: letters, numbers, dot or underscore.',
      );
    }

    const password = checkPassword(body.password);

    const [duplicate] = await pool.query(
      'SELECT id FROM users WHERE username = ?',
      [username],
    );

    if (duplicate.length) {
      throw httpError(409, `The username "${username}" is already taken.`);
    }

    const [result] = await pool.query(
      `INSERT INTO users (full_name, username, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [full_name, username, hashPassword(password), role],
    );

    await logActivity(
      req.user.id,
      'Account created',
      `${full_name} (${role}) added`,
    );

    res.status(201).json({ id: result.insertId });
  }),
);

// Edit a user account
router.put(
  '/:id',
  wrap(async (req, res) => {
    const full_name = checkName(req.body?.full_name);
    const role = checkRole(req.body?.role);

    if (Number(req.params.id) === req.user.id && role !== 'owner') {
      throw httpError(400, 'You cannot change your own role.');
    }

    const [[existing]] = await pool.query(
      'SELECT id FROM users WHERE id = ?',
      [req.params.id],
    );

    if (!existing) throw httpError(404, 'Account not found.');

    await pool.query(
      'UPDATE users SET full_name = ?, role = ? WHERE id = ?',
      [full_name, role, req.params.id],
    );

    await logActivity(
      req.user.id,
      'Account edited',
      `${full_name} is now ${role}`,
    );

    res.json({ ok: true });
  }),
);

// Activate or deactivate an account
router.patch(
  '/:id/active',
  wrap(async (req, res) => {
    if (typeof req.body?.is_active !== 'boolean') {
      throw httpError(400, 'Choose whether the account should be active.');
    }

    const is_active = req.body.is_active;

    if (Number(req.params.id) === req.user.id && !is_active) {
      throw httpError(400, 'You cannot deactivate your own account.');
    }

    const [[user]] = await pool.query(
      'SELECT id, full_name, is_active FROM users WHERE id = ?',
      [req.params.id],
    );

    if (!user) throw httpError(404, 'Account not found.');

    if (Boolean(user.is_active) === is_active) {
      return res.json({ ok: true });
    }

    await pool.query(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [is_active ? 1 : 0, req.params.id],
    );

    await logActivity(
      req.user.id,
      is_active ? 'Account activated' : 'Account deactivated',
      user.full_name,
    );

    res.json({ ok: true });
  }),
);

// Reset a user's password (WBS 4.4.2)
router.post(
  '/:id/reset-password',
  wrap(async (req, res) => {
    const password = checkPassword(req.body?.password);

    const [result] = await pool.query(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hashPassword(password), req.params.id],
    );

    if (!result.affectedRows) {
      throw httpError(404, 'Account not found.');
    }

    const [[user]] = await pool.query(
      'SELECT full_name FROM users WHERE id = ?',
      [req.params.id],
    );

    await logActivity(
      req.user.id,
      'Password reset',
      `Password reset for ${user.full_name}`,
    );

    res.json({ ok: true });
  }),
);

export default router;

export function getUsersHandlerChain(method, path) {
  return getRouteHandlerChain(router, method, path);
}

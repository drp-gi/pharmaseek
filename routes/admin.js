// routes/admin.js
const express       = require('express');
const router        = express.Router();
const bcrypt          = require('bcryptjs');
const isAuthenticated = require('../middleware/authMiddleware');
const authorizeRole   = require('../middleware/roleMiddleware');
const db              = require('../db/connection');
const { manilaTodayISO, daysBetween } = require('../utils/manilaTime');

// All admin routes require login + Admin role
router.use(isAuthenticated);
router.use(authorizeRole(['Admin']));

// GET /admin/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [[{ activeUsers }]] = await db.query(
      `SELECT COUNT(*) AS activeUsers FROM users WHERE status = 'Active'`
    );

    const [[{ pendingRestocks }]] = await db.query(
      `SELECT COUNT(*) AS pendingRestocks FROM restock_requests WHERE status = 'Pending'`
    );

    const [[{ revenue }]] = await db.query(
      `SELECT COALESCE(SUM(st.transaction_quantity * m.unit_price), 0) AS revenue
       FROM stock_transactions st
       JOIN medicines m ON st.medicine_id = m.medicine_id
       WHERE st.transaction_type = 'sale'
         AND MONTH(st.transaction_date) = MONTH(CURDATE())
         AND YEAR(st.transaction_date) = YEAR(CURDATE())`
    );

    const [transactions] = await db.query(
      `SELECT st.transaction_id, st.transaction_type, st.transaction_quantity, st.transaction_date,
              m.medicine_name,
              u.first_name, u.last_name
       FROM stock_transactions st
       JOIN medicines m ON st.medicine_id = m.medicine_id
       JOIN users u ON st.user_id = u.user_id
       ORDER BY st.transaction_date DESC
       LIMIT 10`
    );

    res.render('admin/dashboard', {
      user: req.session.user,
      stats: { activeUsers, pendingRestocks, revenue },
      transactions
    });
  } catch (err) {
    console.error('Dashboard load error:', err);
    res.render('admin/dashboard', {
      user: req.session.user,
      stats: { activeUsers: 0, pendingRestocks: 0, revenue: 0 },
      transactions: []
    });
  }
});

// ── Shared loader for the User Management page ────────────────
// errorSource ('add' | 'edit' | null) tells the view which modal, if
// any, should reopen automatically after a failed submission.
async function loadUsersPage(res, sessionUser, error = null, errorSource = null) {
  const [users] = await db.query(
    `SELECT user_id, first_name, last_name, username, email, position, status
     FROM users
     ORDER BY first_name, last_name`
  );

  res.render('admin/users', {
    user: sessionUser,
    users,
    stats: { totalUsers: users.length },
    error,
    errorSource
  });
}

// Admin accounts are always kept Active — this mirrors the disabled
// toggle in the UI so it can't be bypassed by editing the role/status
// through the Add or Edit forms instead.
function resolveStatus(position, status) {
  if (position === 'Admin') return 'Active';
  return status === 'Inactive' ? 'Inactive' : 'Active';
}

// GET /admin/users
router.get('/users', async (req, res) => {
  try {
    await loadUsersPage(res, req.session.user);
  } catch (err) {
    console.error('User Management load error:', err);
    res.render('admin/users', {
      user: req.session.user,
      users: [],
      stats: { totalUsers: 0 },
      error: 'Could not load users. Please try again.',
      errorSource: null
    });
  }
});

// POST /admin/users — create a new user
router.post('/users', async (req, res) => {
  const { first_name, last_name, username, email, temp_password, position, status } = req.body;

  if (!first_name || !last_name || !username || !temp_password || !position) {
    return loadUsersPage(res, req.session.user, 'Please fill in all required fields.', 'add');
  }

  try {
    const hashed = await bcrypt.hash(temp_password, 10);
    await db.query(
      `INSERT INTO users (first_name, last_name, username, password, email, position, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [first_name, last_name, username, hashed, email || null, position, resolveStatus(position, status)]
    );
    res.redirect('/admin/users');
  } catch (err) {
    const message = err.code === 'ER_DUP_ENTRY'
      ? 'That username is already taken.'
      : 'Could not create user. Please try again.';
    await loadUsersPage(res, req.session.user, message, 'add');
  }
});

// POST /admin/users/:id — update an existing user's details
// Role changes are blocked (silently kept at the current role) for:
//   - your own account
//   - the sole remaining Admin account
// This is enforced here, not just in the UI, since the form field can
// be disabled client-side but that alone doesn't stop a direct request.
router.post('/users/:id', async (req, res) => {
  const { first_name, last_name, username, email, position, status } = req.body;
  const targetId = req.params.id;

  if (!first_name || !last_name || !username) {
    return loadUsersPage(res, req.session.user, 'Please fill in all required fields.', 'edit');
  }

  try {
    const [[targetUser]] = await db.query(
      `SELECT position FROM users WHERE user_id = ?`,
      [targetId]
    );

    if (!targetUser) {
      return loadUsersPage(res, req.session.user, 'User not found.', 'edit');
    }

    const [[{ adminCount }]] = await db.query(
      `SELECT COUNT(*) AS adminCount FROM users WHERE position = 'Admin'`
    );

    const isSelf      = Number(targetId) === Number(req.session.user.user_id);
    const isLastAdmin = targetUser.position === 'Admin' && adminCount === 1;
    const finalPosition = (isSelf || isLastAdmin) ? targetUser.position : (position || targetUser.position);

    await db.query(
      `UPDATE users
       SET first_name = ?, last_name = ?, username = ?, email = ?, position = ?, status = ?
       WHERE user_id = ?`,
      [first_name, last_name, username, email || null, finalPosition, resolveStatus(finalPosition, status), targetId]
    );

    // Keep the session in sync if the admin just edited their own details
    if (isSelf) {
      req.session.user.first_name = first_name;
      req.session.user.last_name  = last_name;
      req.session.user.username   = username;
      req.session.user.email      = email || null;
    }

    res.redirect('/admin/users');
  } catch (err) {
    const message = err.code === 'ER_DUP_ENTRY'
      ? 'That username is already taken.'
      : 'Could not update user. Please try again.';
    await loadUsersPage(res, req.session.user, message, 'edit');
  }
});

// POST /admin/users/:id/toggle-status
// Admin accounts are excluded even if this is called directly, since the
// UI disables the toggle for them.
router.post('/users/:id/toggle-status', async (req, res) => {
  try {
    await db.query(
      `UPDATE users SET status = IF(status = 'Active', 'Inactive', 'Active')
       WHERE user_id = ? AND position != 'Admin'`,
      [req.params.id]
    );
  } catch (err) {
    console.error('Toggle status error:', err);
  }
  res.redirect('/admin/users');
});

// ── Reports ──────────────────────────────────────────────────
const REPORT_TABS = ['stock', 'expiration', 'restock'];
const REPORT_LIMIT = 50;

// 'YYYY-MM-DD' for a number of days before/after today in Manila.
function manilaDateOffsetISO(days) {
  const base = new Date(manilaTodayISO() + 'T00:00:00Z');
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

// GET /admin/reports
router.get('/reports', async (req, res) => {
  const tab = REPORT_TABS.includes(req.query.tab) ? req.query.tab : 'stock';

  const from = req.query.from || manilaDateOffsetISO(-30);
  const to   = req.query.to   || manilaTodayISO();
  const type = ['restock', 'sale', 'disposal'].includes(req.query.type) ? req.query.type : 'All';

  try {
    let rows = [];
    let totalCount = 0;

    if (tab === 'stock') {
      const typeClause = type !== 'All' ? 'AND st.transaction_type = ?' : '';
      const params = [from, `${to} 23:59:59`];
      if (type !== 'All') params.push(type);

      const [[{ count }]] = await db.query(
        `SELECT COUNT(*) AS count
         FROM stock_transactions st
         WHERE st.transaction_date BETWEEN ? AND ? ${typeClause}`,
        params
      );
      totalCount = count;

      [rows] = await db.query(
        `SELECT st.transaction_id, st.transaction_date, st.transaction_type, st.transaction_quantity,
                m.medicine_name, u.first_name, u.last_name
         FROM stock_transactions st
         JOIN medicines m ON st.medicine_id = m.medicine_id
         JOIN users u ON st.user_id = u.user_id
         WHERE st.transaction_date BETWEEN ? AND ? ${typeClause}
         ORDER BY st.transaction_date DESC
         LIMIT ${REPORT_LIMIT}`,
        params
      );

    } else if (tab === 'expiration') {
      const [[{ count }]] = await db.query(
        `SELECT COUNT(*) AS count FROM medicines
         WHERE expiration_date IS NOT NULL AND expiration_date BETWEEN ? AND ?`,
        [from, to]
      );
      totalCount = count;

      [rows] = await db.query(
        `SELECT medicine_id, medicine_name, stock_quantity, expiration_date
         FROM medicines
         WHERE expiration_date IS NOT NULL AND expiration_date BETWEEN ? AND ?
         ORDER BY expiration_date ASC
         LIMIT ${REPORT_LIMIT}`,
        [from, to]
      );

      const todayISO = manilaTodayISO();
      rows.forEach((r) => {
        const daysLeft = daysBetween(todayISO, r.expiration_date);
        r.daysLeft = daysLeft;
        if (daysLeft < 0) {
          r.statusClass = 'expired';
          r.statusLabel = 'Expired';
        } else if (daysLeft <= 30) {
          r.statusClass = 'expiring';
          r.statusLabel = 'Expiring Soon';
        } else {
          r.statusClass = 'good';
          r.statusLabel = 'Good';
        }
      });

    } else {
      const [[{ count }]] = await db.query(
        `SELECT COUNT(*) AS count FROM restock_requests
         WHERE request_date BETWEEN ? AND ?`,
        [from, `${to} 23:59:59`]
      );
      totalCount = count;

      [rows] = await db.query(
        `SELECT rr.request_id, rr.request_date, rr.quantity_requested, rr.status,
                m.medicine_name, u.first_name, u.last_name
         FROM restock_requests rr
         JOIN medicines m ON rr.medicine_id = m.medicine_id
         LEFT JOIN users u ON rr.user_id = u.user_id
         WHERE rr.request_date BETWEEN ? AND ?
         ORDER BY rr.request_date DESC
         LIMIT ${REPORT_LIMIT}`,
        [from, `${to} 23:59:59`]
      );
    }

    const [medicines] = await db.query(
      `SELECT medicine_id, medicine_name FROM medicines ORDER BY medicine_name`
    );

    res.render('admin/reports', {
      user: req.session.user,
      tab, from, to, type,
      rows, totalCount,
      medicines,
      logged: req.query.logged === '1',
      logError: req.query.logerror === '1',
      error: null
    });
  } catch (err) {
    console.error('Reports load error:', err);
    res.render('admin/reports', {
      user: req.session.user,
      tab, from, to, type,
      rows: [], totalCount: 0,
      medicines: [],
      logged: false,
      logError: false,
      error: 'Could not load report data. Please try again.'
    });
  }
});

// POST /admin/reports/logs — submit a management log entry
router.post('/reports/logs', async (req, res) => {
  const { findings, corrective_action, medicine_id, return_to } = req.body;
  const base = (return_to && return_to.startsWith('/admin/reports')) ? return_to : '/admin/reports';
  const sep  = base.includes('?') ? '&' : '?';

  if (!findings || !corrective_action) {
    return res.redirect(base + sep + 'logerror=1');
  }

  try {
    await db.query(
      `INSERT INTO management_logs (findings, corrective_action, user_id, medicine_id)
       VALUES (?, ?, ?, ?)`,
      [findings, corrective_action, req.session.user.user_id, medicine_id || null]
    );
    res.redirect(base + sep + 'logged=1');
  } catch (err) {
    console.error('Management log submit error:', err);
    res.redirect(base + sep + 'logerror=1');
  }
});

module.exports = router;
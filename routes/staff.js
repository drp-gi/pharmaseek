// routes/staff.js
const express         = require('express');
const router          = express.Router();
const bcrypt          = require('bcryptjs');
const isAuthenticated = require('../middleware/authMiddleware');
const authorizeRole   = require('../middleware/roleMiddleware');
const db              = require('../db/connection');
const { manilaTodayISO, daysBetween } = require('../utils/manilaTime');
const { confirmDelivery } = require('../utils/confirmDelivery');
const { maybeCreateRestockRequest } = require('../utils/autoRestock');

// All staff routes require login + Staff role
router.use(isAuthenticated);
router.use(authorizeRole(['Staff']));

// Classifies a medicine into at most one alert badge, most urgent first:
// Expired > Out of Stock > Expiring Soon (30 days) > Low Stock. Returns
// null when the medicine is healthy (in stock, not expired/expiring).
function getStatusBadge(m) {
  const stockQty   = Number(m.stock_quantity);
  const threshold  = Number(m.stock_threshold);
  let daysLeft = null;
  let isExpired = false;

  if (m.expiration_date) {
    daysLeft = daysBetween(manilaTodayISO(), m.expiration_date);
    isExpired = daysLeft < 0;
  }

  if (isExpired) return { cls: 'expired', label: 'Expired' };
  if (stockQty === 0) return { cls: 'out-of-stock', label: 'Out of Stock' };
  if (daysLeft !== null && daysLeft <= 30) return { cls: 'expiring', label: 'Expiring Soon' };
  if (stockQty < threshold) return { cls: 'low-stock', label: 'Low Stock' };
  return null;
}

// GET /staff/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [[{ outOfStock }]] = await db.query(
      `SELECT COUNT(*) AS outOfStock FROM medicines WHERE stock_quantity = 0`
    );

    const [[{ lowStock }]] = await db.query(
      `SELECT COUNT(*) AS lowStock FROM medicines WHERE stock_quantity > 0 AND stock_quantity < stock_threshold`
    );

    const [[{ expired }]] = await db.query(
      `SELECT COUNT(*) AS expired FROM medicines
       WHERE expiration_date IS NOT NULL AND expiration_date < CURDATE()`
    );

    const [[{ expiringSoon }]] = await db.query(
      `SELECT COUNT(*) AS expiringSoon FROM medicines
       WHERE expiration_date IS NOT NULL
         AND expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`
    );

    const [[{ approvedAwaitingDelivery }]] = await db.query(
      `SELECT COUNT(*) AS approvedAwaitingDelivery FROM restock_requests WHERE status = 'Approved'`
    );

    const [[{ transactionsToday }]] = await db.query(
      `SELECT COUNT(*) AS transactionsToday FROM stock_transactions
       WHERE user_id = ? AND DATE(transaction_date) = CURDATE()`,
      [req.session.user.user_id]
    );

    res.render('staff/dashboard', {
      user: req.session.user,
      stats: { outOfStock, lowStock, expired, expiringSoon },
      approvedAwaitingDelivery,
      transactionsToday,
      error: null
    });
  } catch (err) {
    console.error('Staff dashboard load error:', err);
    res.render('staff/dashboard', {
      user: req.session.user,
      stats: { outOfStock: 0, lowStock: 0, expired: 0, expiringSoon: 0 },
      approvedAwaitingDelivery: 0,
      transactionsToday: 0,
      error: 'Could not load dashboard data. Please try again.'
    });
  }
});

// GET /staff/inventory — read-only medicine catalog (no add/edit/delete)
router.get('/inventory', async (req, res) => {
  const search   = req.query.search || '';
  const category = req.query.category || 'All';

  try {
    const [categories] = await db.query(
      `SELECT category_id, category_name FROM categories ORDER BY category_name`
    );

    // Discontinued medicines are hidden from active inventory — Staff's
    // catalog is read-only and only ever shows what's still sellable.
    const clauses = [`m.status = 'Active'`];
    const params = [];
    if (search) {
      clauses.push('m.medicine_name LIKE ?');
      params.push(`%${search}%`);
    }
    if (category !== 'All') {
      clauses.push('m.category_id = ?');
      params.push(category);
    }
    const whereClause = `WHERE ${clauses.join(' AND ')}`;

    const [medicines] = await db.query(
      `SELECT m.medicine_id, m.medicine_name, m.brand_name, m.medicine_type, m.dose,
              m.description, m.unit_price, m.stock_quantity, m.stock_threshold,
              m.expiration_date, m.image_path,
              c.category_id, c.category_name,
              s.company_name AS supplier_name, s.phone_number AS supplier_phone
       FROM medicines m
       LEFT JOIN categories c ON m.category_id = c.category_id
       LEFT JOIN suppliers s ON m.supplier_id = s.supplier_id
       ${whereClause}
       ORDER BY c.category_name, m.medicine_name`,
      params
    );

    medicines.forEach((m) => { m.statusBadge = getStatusBadge(m); });

    const groups = [];
    for (const med of medicines) {
      const groupName = med.category_name || 'Uncategorized';
      let group = groups.find((g) => g.name === groupName);
      if (!group) {
        group = { name: groupName, items: [] };
        groups.push(group);
      }
      group.items.push(med);
    }

    res.render('staff/inventory', {
      user: req.session.user,
      groups,
      categories,
      search,
      category,
      error: null
    });
  } catch (err) {
    console.error('Staff inventory load error:', err);
    res.render('staff/inventory', {
      user: req.session.user,
      groups: [],
      categories: [],
      search,
      category,
      error: 'Could not load the medicine catalog. Please try again.'
    });
  }
});

// ── Shared loader for the Transactions page ──────────────────────
async function loadTransactionsPage(res, sessionUser, tab, error = null) {
  const validTabs = ['sale', 'disposal', 'delivery'];
  const activeTab = validTabs.includes(tab) ? tab : 'sale';

  // Discontinued medicines can't be sold or disposed of, so they're left
  // out of this picker.
  const [medicines] = await db.query(
    `SELECT medicine_id, medicine_name, stock_quantity, unit_price, image_path
     FROM medicines WHERE status = 'Active' ORDER BY medicine_name`
  );

  let todaysEntries = [];
  let approvedDeliveries = [];

  if (activeTab === 'delivery') {
    [approvedDeliveries] = await db.query(
      `SELECT rr.request_id, rr.quantity_requested, rr.request_date, m.medicine_name
       FROM restock_requests rr
       JOIN medicines m ON rr.medicine_id = m.medicine_id
       WHERE rr.status = 'Approved'
       ORDER BY rr.request_date ASC`
    );
  } else {
    [todaysEntries] = await db.query(
      `SELECT st.transaction_id, st.transaction_quantity, st.transaction_date, st.disposal_reason,
              m.medicine_name, m.unit_price
       FROM stock_transactions st
       JOIN medicines m ON st.medicine_id = m.medicine_id
       WHERE st.transaction_type = ? AND st.user_id = ? AND DATE(st.transaction_date) = CURDATE()
       ORDER BY st.transaction_date DESC`,
      [activeTab, sessionUser.user_id]
    );
  }

  res.render('staff/transactions', {
    user: sessionUser,
    tab: activeTab,
    medicines,
    todaysEntries,
    approvedDeliveries,
    error
  });
}

// GET /staff/transactions
router.get('/transactions', async (req, res) => {
  try {
    await loadTransactionsPage(res, req.session.user, req.query.tab);
  } catch (err) {
    console.error('Transactions load error:', err);
    res.render('staff/transactions', {
      user: req.session.user,
      tab: 'sale',
      medicines: [],
      todaysEntries: [],
      approvedDeliveries: [],
      error: 'Could not load transactions. Please try again.'
    });
  }
});

// POST /staff/transactions/sale — record a sale, decrementing stock
router.post('/transactions/sale', async (req, res) => {
  const { medicine_id, quantity } = req.body;
  const qty = Number(quantity);

  if (!medicine_id || !qty || qty <= 0) {
    return loadTransactionsPage(res, req.session.user, 'sale', 'Please select a medicine and enter a valid quantity.');
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [[medicine]] = await connection.query(
      `SELECT stock_quantity FROM medicines WHERE medicine_id = ? FOR UPDATE`,
      [medicine_id]
    );

    if (!medicine) {
      await connection.rollback();
      return loadTransactionsPage(res, req.session.user, 'sale', 'That medicine no longer exists.');
    }
    if (qty > medicine.stock_quantity) {
      await connection.rollback();
      return loadTransactionsPage(res, req.session.user, 'sale', `Only ${medicine.stock_quantity} units in stock — can't sell ${qty}.`);
    }

    await connection.query(
      `UPDATE medicines SET stock_quantity = stock_quantity - ? WHERE medicine_id = ?`,
      [qty, medicine_id]
    );
    await connection.query(
      `INSERT INTO stock_transactions (transaction_type, transaction_quantity, medicine_id, user_id)
       VALUES ('sale', ?, ?, ?)`,
      [qty, medicine_id, req.session.user.user_id]
    );

    await maybeCreateRestockRequest(connection, {
      medicineId: medicine_id,
      userId: req.session.user.user_id,
      reason: 'Auto-generated: stock fell below threshold after a sale.'
    });

    await connection.commit();
    res.redirect('/staff/transactions?tab=sale');
  } catch (err) {
    console.error('Record sale error:', err);
    if (connection) { try { await connection.rollback(); } catch (rollbackErr) { console.error(rollbackErr); } }
    await loadTransactionsPage(res, req.session.user, 'sale', 'Could not record this sale. Please try again.');
  } finally {
    if (connection) connection.release();
  }
});

// POST /staff/transactions/disposal — record a disposal, decrementing stock
router.post('/transactions/disposal', async (req, res) => {
  const { medicine_id, quantity, disposal_reason } = req.body;
  const qty = Number(quantity);

  if (!medicine_id || !qty || qty <= 0 || !disposal_reason) {
    return loadTransactionsPage(res, req.session.user, 'disposal', 'Please select a medicine, enter a valid quantity, and provide a reason.');
  }

  let connection;
  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [[medicine]] = await connection.query(
      `SELECT stock_quantity FROM medicines WHERE medicine_id = ? FOR UPDATE`,
      [medicine_id]
    );

    if (!medicine) {
      await connection.rollback();
      return loadTransactionsPage(res, req.session.user, 'disposal', 'That medicine no longer exists.');
    }
    if (qty > medicine.stock_quantity) {
      await connection.rollback();
      return loadTransactionsPage(res, req.session.user, 'disposal', `Only ${medicine.stock_quantity} units in stock — can't dispose ${qty}.`);
    }

    await connection.query(
      `UPDATE medicines SET stock_quantity = stock_quantity - ? WHERE medicine_id = ?`,
      [qty, medicine_id]
    );
    await connection.query(
      `INSERT INTO stock_transactions (transaction_type, transaction_quantity, disposal_reason, medicine_id, user_id)
       VALUES ('disposal', ?, ?, ?, ?)`,
      [qty, disposal_reason, medicine_id, req.session.user.user_id]
    );

    await maybeCreateRestockRequest(connection, {
      medicineId: medicine_id,
      userId: req.session.user.user_id,
      reason: 'Auto-generated: stock fell below threshold after a disposal.'
    });

    await connection.commit();
    res.redirect('/staff/transactions?tab=disposal');
  } catch (err) {
    console.error('Record disposal error:', err);
    if (connection) { try { await connection.rollback(); } catch (rollbackErr) { console.error(rollbackErr); } }
    await loadTransactionsPage(res, req.session.user, 'disposal', 'Could not record this disposal. Please try again.');
  } finally {
    if (connection) connection.release();
  }
});

// POST /staff/transactions/delivery-checkin/:id
// Requires the actually-received quantity from the Confirm Delivery popup
// (not just trusting the original requested quantity) before stock moves.
router.post('/transactions/delivery-checkin/:id', async (req, res) => {
  const qty = Number(req.body.quantity_received);

  if (qty > 0) {
    try {
      await confirmDelivery(db, {
        requestId: req.params.id,
        quantityReceived: qty,
        notes: req.body.notes,
        userId: req.session.user.user_id
      });
    } catch (err) {
      console.error('Delivery check-in error:', err);
    }
  }

  res.redirect('/staff/transactions?tab=delivery');
});

// ── Settings ─────────────────────────────────────────────────

// GET /staff/settings
router.get('/settings', async (req, res) => {
  try {
    const [[profile]] = await db.query(
      `SELECT first_name, last_name, username, email, position, status FROM users WHERE user_id = ?`,
      [req.session.user.user_id]
    );
    res.render('staff/settings', { user: req.session.user, profile, error: null, success: null });
  } catch (err) {
    console.error('Settings load error:', err);
    res.render('staff/settings', {
      user: req.session.user,
      profile: req.session.user,
      error: 'Could not load settings. Please try again.',
      success: null
    });
  }
});

// POST /staff/settings — updates the staff member's own profile and
// (optionally) their password, from the page's single Save button.
router.post('/settings', async (req, res) => {
  const {
    first_name, last_name, username, email,
    current_password, new_password, confirm_password
  } = req.body;

  const rerender = (error, success, profileOverride) => {
    res.render('staff/settings', {
      user: req.session.user,
      profile: profileOverride || { ...req.session.user, first_name, last_name, username, email },
      error,
      success
    });
  };

  if (!first_name || !last_name || !username) {
    return rerender('Please fill in all required fields.', null);
  }

  const wantsPasswordChange = current_password || new_password || confirm_password;
  if (wantsPasswordChange) {
    if (!current_password || !new_password || !confirm_password) {
      return rerender('Fill in all three password fields to change your password.', null);
    }
    if (new_password !== confirm_password) {
      return rerender('New password and confirmation do not match.', null);
    }
    if (new_password.length < 6) {
      return rerender('New password must be at least 6 characters.', null);
    }
  }

  try {
    let hashedPassword = null;
    if (wantsPasswordChange) {
      const [[dbUser]] = await db.query(
        `SELECT password FROM users WHERE user_id = ?`,
        [req.session.user.user_id]
      );
      const matches = await bcrypt.compare(current_password, dbUser.password);
      if (!matches) {
        return rerender('Current password is incorrect.', null);
      }
      hashedPassword = await bcrypt.hash(new_password, 10);
    }

    if (hashedPassword) {
      await db.query(
        `UPDATE users SET first_name = ?, last_name = ?, username = ?, email = ?, password = ? WHERE user_id = ?`,
        [first_name, last_name, username, email || null, hashedPassword, req.session.user.user_id]
      );
    } else {
      await db.query(
        `UPDATE users SET first_name = ?, last_name = ?, username = ?, email = ? WHERE user_id = ?`,
        [first_name, last_name, username, email || null, req.session.user.user_id]
      );
    }

    req.session.user.first_name = first_name;
    req.session.user.last_name = last_name;
    req.session.user.username = username;
    req.session.user.email = email || null;

    const [[profile]] = await db.query(
      `SELECT first_name, last_name, username, email, position, status FROM users WHERE user_id = ?`,
      [req.session.user.user_id]
    );
    res.render('staff/settings', {
      user: req.session.user,
      profile,
      error: null,
      success: 'Changes saved successfully.'
    });
  } catch (err) {
    const message = err.code === 'ER_DUP_ENTRY'
      ? 'That username is already taken.'
      : 'Could not save changes. Please try again.';
    console.error('Settings update error:', err);
    rerender(message, null);
  }
});

module.exports = router;

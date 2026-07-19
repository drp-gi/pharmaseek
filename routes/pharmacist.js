// routes/pharmacist.js
// everything the pharmacist role can do: dashboard, full medicine catalog management (add/edit/discontinue/reactivate), approving or dismissing restock requests, recording sales/disposals, delivery check-ins, and their own settings. this is the one role with write access to the medicine catalog.
const express         = require('express');
const router           = express.Router();
const multer           = require('multer');
const path              = require('path');
const bcrypt           = require('bcryptjs');
const isAuthenticated  = require('../middleware/authMiddleware');
const authorizeRole    = require('../middleware/roleMiddleware');
const db               = require('../db/connection');
const { confirmDelivery } = require('../utils/confirmDelivery');
const { maybeCreateRestockRequest } = require('../utils/autoRestock');
const { getStatusBadge } = require('../utils/medicineStatus');

// every route below needs a logged-in session and the Pharmacist position, checked once here so we don't repeat it in every handler.
router.use(isAuthenticated);
router.use(authorizeRole(['Pharmacist']));

// ── medicine image upload ───────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'medicines');
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
      cb(null, `${Date.now()}-${base}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // cap uploads at 5mb, plenty for a medicine photo, small enough not to eat disk space
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP, or AVIF images are allowed.'));
  }
});

// wraps upload.single so a multer error, bad file type or file too big, shows up as a normal page error instead of crashing the request with an unhandled exception.
function uploadMedicineImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    console.error('Image upload error:', err);
    loadInventoryPage(res, req.session.user, { search: '', category: 'All' }, err.message || 'Could not upload the image.')
      .catch(() => res.redirect('/pharmacist/inventory'));
  });
}

// GET /pharmacist/dashboard
// same idea as the staff dashboard but pharmacist version siya, pulls stock counts, pending restock requests that need approval, and recent activity across the whole pharmacy, not just this one user's own actions.
router.get('/dashboard', async (req, res) => {
  
  try {
    const [[{ totalMedicines }]] = await db.query(
      `SELECT COUNT(*) AS totalMedicines FROM medicines`
    );

    const [[{ lowStock }]] = await db.query(
      `SELECT COUNT(*) AS lowStock FROM medicines WHERE stock_quantity < stock_threshold`
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

    const [[{ pendingRestocks }]] = await db.query(
      `SELECT COUNT(*) AS pendingRestocks FROM restock_requests WHERE status = 'Pending'`
    );

    const [lowStockItems] = await db.query(
      `SELECT m.medicine_id, m.medicine_name, m.stock_quantity, m.stock_threshold, c.category_name
       FROM medicines m
       LEFT JOIN categories c ON m.category_id = c.category_id
       WHERE m.stock_quantity < m.stock_threshold
       ORDER BY m.stock_quantity ASC, (m.stock_threshold - m.stock_quantity) DESC
       LIMIT 8`
    );

    const [nearExpiryItems] = await db.query(
      `SELECT m.medicine_id, m.medicine_name, m.expiration_date, c.category_name,
              DATEDIFF(m.expiration_date, CURDATE()) AS daysLeft
       FROM medicines m
       LEFT JOIN categories c ON m.category_id = c.category_id
       WHERE m.expiration_date IS NOT NULL
         AND m.expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       ORDER BY m.expiration_date ASC
       LIMIT 8`
    );

    const [pendingRestockItems] = await db.query(
      `SELECT rr.request_id, rr.quantity_requested, rr.request_date, m.medicine_name, m.stock_quantity
       FROM restock_requests rr
       JOIN medicines m ON rr.medicine_id = m.medicine_id
       WHERE rr.status = 'Pending'
       ORDER BY rr.request_date ASC
       LIMIT 10`
    );

    const [recentTransactions] = await db.query(
      `SELECT st.transaction_id, st.transaction_type, st.transaction_quantity, st.transaction_date,
              m.medicine_name, m.stock_quantity, u.first_name, u.last_name
       FROM stock_transactions st
       JOIN medicines m ON st.medicine_id = m.medicine_id
       JOIN users u ON st.user_id = u.user_id
       ORDER BY st.transaction_date DESC
       LIMIT 10`
    );

    res.render('pharmacist/dashboard', {
      user: req.session.user,
      stats: { totalMedicines, lowStock, expired, expiringSoon, pendingRestocks },
      lowStockItems,
      nearExpiryItems,
      pendingRestockItems,
      recentTransactions,
      error: null
    });
  } catch (err) {
    console.error('Pharmacist dashboard load error:', err);
    res.render('pharmacist/dashboard', {
      user: req.session.user,
      stats: { totalMedicines: 0, lowStock: 0, expired: 0, expiringSoon: 0, pendingRestocks: 0 },
      lowStockItems: [],
      nearExpiryItems: [],
      pendingRestockItems: [],
      recentTransactions: [],
      error: 'Could not load dashboard data. Please try again.'
    });
  }
});

// sends the pharmacist back to wherever they clicked approve/dismiss from, dashboard or the restock requests page, falls back to the given default if return_to is missing or looks unsafe.
function safeRedirect(req, res, fallback) {
  const returnTo = req.body.return_to;
  const isSafe = returnTo
    && (returnTo.startsWith('/pharmacist/dashboard') || returnTo.startsWith('/pharmacist/restock-requests'));
  res.redirect(isSafe ? returnTo : fallback);
}

// shared loader for the restock requests page, one tab per status (pending/approved/completed/cancelled), reused by the GET route and every POST action below so they can all re-render the same page after doing their thing.
async function loadRestockRequestsPage(res, sessionUser, tab, error = null) {
  const validTabs = ['Pending', 'Approved', 'Completed', 'Cancelled'];
  const activeTab = validTabs.includes(tab) ? tab : 'Pending';

  const [requests] = await db.query(
    `SELECT rr.request_id, rr.quantity_requested, rr.request_date, rr.notes,
            m.medicine_name, m.stock_quantity, c.category_name, st.transaction_quantity AS quantity_received
     FROM restock_requests rr
     JOIN medicines m ON rr.medicine_id = m.medicine_id
     LEFT JOIN categories c ON m.category_id = c.category_id
     LEFT JOIN stock_transactions st ON st.request_id = rr.request_id AND st.transaction_type = 'restock'
     WHERE rr.status = ?
     ORDER BY rr.request_date DESC`,
    [activeTab]
  );

  // discontinued medicines aren't restockable, so they're left out of the request dropdown entirely, no point suggesting a restock for something no longer sold.
  const [medicines] = await db.query(
    `SELECT medicine_id, medicine_name, stock_quantity, stock_threshold
     FROM medicines WHERE status = 'Active' ORDER BY medicine_name`
  );

  res.render('pharmacist/restock-requests', {
    user: sessionUser,
    tab: activeTab,
    requests,
    medicines,
    error
  });
}

// GET /pharmacist/restock-requests
router.get('/restock-requests', async (req, res) => {
  try {
    await loadRestockRequestsPage(res, req.session.user, req.query.tab);
  } catch (err) {
    console.error('Restock requests load error:', err);
    res.render('pharmacist/restock-requests', {
      user: req.session.user,
      tab: 'Pending',
      requests: [],
      medicines: [],
      error: 'Could not load restock requests. Please try again.'
    });
  }
});

// POST /pharmacist/restock-requests
// creates a brand new pending request, this is the pharmacist's own version of the same "new request" flow staff gets on their transactions page.
router.post('/restock-requests', async (req, res) => {
  const { medicine_id, quantity_requested, notes } = req.body;

  if (!medicine_id || !quantity_requested) {
    return loadRestockRequestsPage(res, req.session.user, 'Pending', 'Please select a medicine and enter a quantity.');
  }

  try {
    await db.query(
      `INSERT INTO restock_requests (status, quantity_requested, notes, medicine_id, user_id)
       VALUES ('Pending', ?, ?, ?, ?)`,
      [quantity_requested, notes || null, medicine_id, req.session.user.user_id]
    );
    res.redirect('/pharmacist/restock-requests?tab=Pending');
  } catch (err) {
    console.error('Create restock request error:', err);
    await loadRestockRequestsPage(res, req.session.user, 'Pending', 'Could not create the restock request. Please try again.');
  }
});

// POST /pharmacist/restock-requests/:id/approve
// the pending tab's requested qty column is an editable input wired to this form through the `form` attribute, so whatever's typed in it at submit time, the system's own suggestion or a pharmacist's manual edit, overwrites quantity_requested. forms that don't carry that field, like the dashboard's quick approve button, just flip the status and leave the quantity as it already was.
router.post('/restock-requests/:id/approve', async (req, res) => {
  const qty = Number(req.body.quantity_requested);
  try {
    if (qty > 0) {
      await db.query(
        `UPDATE restock_requests SET status = 'Approved', quantity_requested = ?
         WHERE request_id = ? AND status = 'Pending'`,
        [qty, req.params.id]
      );
    } else {
      await db.query(
        `UPDATE restock_requests SET status = 'Approved' WHERE request_id = ? AND status = 'Pending'`,
        [req.params.id]
      );
    }
  } catch (err) {
    console.error('Approve restock request error:', err);
  }
  safeRedirect(req, res, '/pharmacist/dashboard');
});

// POST /pharmacist/restock-requests/:id/dismiss
// dismissing doesn't touch stock at all, it just goes quiet until a real event on that medicine (a sale, a disposal, a delivery) re-triggers the auto-restock check on its own later. a medicine sitting at 0 stock is the one case that breaks that assumption though, nothing can be sold or disposed from empty stock, and delivery check-in needs an approved request that would stop existing the moment this got cancelled, so there's no other event left that could ever catch it again. rather than cancel it and just regenerate a duplicate a second later, we refuse the dismiss outright here. the ui already explains why before the request ever gets this far, but this is the real enforcement, not just the copy on the button.
router.post('/restock-requests/:id/dismiss', async (req, res) => {
  try {
    const [[request]] = await db.query(
      `SELECT rr.request_id, m.stock_quantity
       FROM restock_requests rr
       JOIN medicines m ON rr.medicine_id = m.medicine_id
       WHERE rr.request_id = ? AND rr.status = 'Pending'`,
      [req.params.id]
    );

    if (request && request.stock_quantity > 0) {
      await db.query(
        `UPDATE restock_requests SET status = 'Cancelled' WHERE request_id = ? AND status = 'Pending'`,
        [req.params.id]
      );
    }
  } catch (err) {
    console.error('Dismiss restock request error:', err);
  }
  safeRedirect(req, res, '/pharmacist/dashboard');
});

// POST /pharmacist/restock-requests/:id/confirm-delivery
// same verification step and stock-moving logic as staff's delivery check-in, needs the actually-received quantity before this request gets marked complete and stock actually updates.
router.post('/restock-requests/:id/confirm-delivery', async (req, res) => {
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
      console.error('Confirm delivery error:', err);
    }
  }

  safeRedirect(req, res, '/pharmacist/dashboard');
});

// ── shared loader for the inventory page ────────────────────────
async function loadInventoryPage(res, sessionUser, filters, error = null) {
  const { search = '', category = 'All' } = filters;

  const [categories] = await db.query(
    `SELECT category_id, category_name FROM categories ORDER BY category_name`
  );
  const [suppliers] = await db.query(
    `SELECT supplier_id, company_name FROM suppliers ORDER BY company_name`
  );

  const clauses = [];
  const params = [];
  if (search) {
    clauses.push('m.medicine_name LIKE ?');
    params.push(`%${search}%`);
  }
  if (category !== 'All') {
    clauses.push('m.category_id = ?');
    params.push(category);
  }
  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  // active and discontinued medicines both get fetched together here, the catalog page toggles between them client-side through the category/status dropdown instead of round-tripping to the server for it.
  const [medicines] = await db.query(
    `SELECT m.medicine_id, m.medicine_name, m.brand_name, m.medicine_type, m.dose,
            m.description, m.unit_price, m.stock_quantity, m.stock_threshold,
            m.expiration_date, m.image_path, m.status,
            c.category_id, c.category_name,
            s.supplier_id, s.company_name AS supplier_name, s.phone_number AS supplier_phone
     FROM medicines m
     LEFT JOIN categories c ON m.category_id = c.category_id
     LEFT JOIN suppliers s ON m.supplier_id = s.supplier_id
     ${whereClause}
     ORDER BY c.category_name, m.medicine_name`,
    params
  );

  // discontinued medicines get their own badge in the card, that's handled in the view, so they don't also need a stock/expiry status computed for them here.
  medicines.forEach((med) => {
    med.statusBadge = med.status === 'Discontinued' ? null : getStatusBadge(med);
  });

  const groups = [];
  for (const med of medicines) {
    const groupName = med.category_name || 'Uncategorized';
    let group = groups.find((g) => g.name === groupName);
    if (!group) {
      group = { name: groupName, items: [], activeCount: 0 };
      groups.push(group);
    }
    group.items.push(med);
    if (med.status !== 'Discontinued') group.activeCount++;
  }

  res.render('pharmacist/inventory', {
    user: sessionUser,
    groups,
    categories,
    suppliers,
    search,
    category,
    error
  });
}

// GET /pharmacist/inventory
// full read/write medicine catalog for the pharmacist, same grouping and filtering as staff's version but with add/edit/discontinue actions layered on top.
router.get('/inventory', async (req, res) => {
  const filters = { search: req.query.search || '', category: req.query.category || 'All' };
  try {
    await loadInventoryPage(res, req.session.user, filters);
  } catch (err) {
    console.error('Inventory load error:', err);
    res.render('pharmacist/inventory', {
      user: req.session.user,
      groups: [],
      categories: [],
      suppliers: [],
      search: filters.search,
      category: filters.category,
      error: 'Could not load the medicine catalog. Please try again.'
    });
  }
});

// POST /pharmacist/inventory
// adds a brand new medicine to the catalog, runs through uploadMedicineImage first so the optional photo lands on disk before we ever touch the database.
router.post('/inventory', uploadMedicineImage, async (req, res) => {
  const {
    medicine_name, brand_name, medicine_type, dose, description,
    unit_price, stock_quantity, stock_threshold, expiration_date,
    category_id, supplier_id
  } = req.body;

  if (!medicine_name || !unit_price || !stock_quantity || !stock_threshold) {
    return loadInventoryPage(res, req.session.user, { search: '', category: 'All' }, 'Please fill in all required fields.');
  }

  const image_path = req.file ? `/uploads/medicines/${req.file.filename}` : null;

  try {
    await db.query(
      `INSERT INTO medicines
         (medicine_name, brand_name, medicine_type, dose, description, unit_price,
          stock_quantity, stock_threshold, expiration_date, image_path, category_id, supplier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        medicine_name, brand_name || null, medicine_type || null, dose || null, description || null,
        unit_price, stock_quantity, stock_threshold, expiration_date || null, image_path,
        category_id || null, supplier_id || null
      ]
    );
    res.redirect('/pharmacist/inventory');
  } catch (err) {
    console.error('Add medicine error:', err);
    await loadInventoryPage(res, req.session.user, { search: '', category: 'All' }, 'Could not add this medicine. Please try again.');
  }
});

// POST /pharmacist/inventory/:id
// edits an existing medicine's details. if no new photo gets uploaded this time, existing_image_path, a hidden field carrying the medicine's current image_path, gets kept so the old photo doesn't get wiped out by accident.
router.post('/inventory/:id', uploadMedicineImage, async (req, res) => {
  const {
    medicine_name, brand_name, medicine_type, dose, description,
    unit_price, stock_quantity, stock_threshold, expiration_date,
    category_id, supplier_id, existing_image_path
  } = req.body;

  if (!medicine_name || !unit_price || !stock_quantity || !stock_threshold) {
    return loadInventoryPage(res, req.session.user, { search: '', category: 'All' }, 'Please fill in all required fields.');
  }

  const image_path = req.file ? `/uploads/medicines/${req.file.filename}` : (existing_image_path || null);

  try {
    await db.query(
      `UPDATE medicines
       SET medicine_name = ?, brand_name = ?, medicine_type = ?, dose = ?, description = ?,
           unit_price = ?, stock_quantity = ?, stock_threshold = ?, expiration_date = ?,
           image_path = ?, category_id = ?, supplier_id = ?
       WHERE medicine_id = ?`,
      [
        medicine_name, brand_name || null, medicine_type || null, dose || null, description || null,
        unit_price, stock_quantity, stock_threshold, expiration_date || null, image_path,
        category_id || null, supplier_id || null, req.params.id
      ]
    );
    res.redirect('/pharmacist/inventory');
  } catch (err) {
    console.error('Edit medicine error:', err);
    await loadInventoryPage(res, req.session.user, { search: '', category: 'All' }, 'Could not update this medicine. Please try again.');
  }
});

// POST /pharmacist/categories
// quick-add a category straight from the medicine form's dropdown, returns json so the front end can drop it into the select without reloading the whole page.
router.post('/categories', async (req, res) => {
  const category_name = (req.body.category_name || '').trim();
  if (!category_name) return res.status(400).json({ error: 'Category name is required.' });

  try {
    const [result] = await db.query(
      `INSERT INTO categories (category_name) VALUES (?)`,
      [category_name]
    );
    res.json({ category_id: result.insertId, category_name });
  } catch (err) {
    console.error('Add category error:', err);
    res.status(500).json({ error: 'Could not add category.' });
  }
});

// POST /pharmacist/suppliers
// same quick-add pattern as categories above, but for suppliers, same reason: keep the pharmacist inside the medicine form instead of bouncing them to a separate page.
router.post('/suppliers', async (req, res) => {
  const company_name = (req.body.company_name || '').trim();
  const phone_number = (req.body.phone_number || '').trim();
  if (!company_name) return res.status(400).json({ error: 'Supplier name is required.' });

  try {
    const [result] = await db.query(
      `INSERT INTO suppliers (company_name, phone_number) VALUES (?, ?)`,
      [company_name, phone_number || null]
    );
    res.json({ supplier_id: result.insertId, company_name });
  } catch (err) {
    console.error('Add supplier error:', err);
    res.status(500).json({ error: 'Could not add supplier.' });
  }
});

// POST /pharmacist/inventory/:id/discontinue
// this is a soft delete, it hides the medicine from active inventory (the catalog, sale/disposal pickers, restock requests) while keeping its stock_transactions and management_logs history fully intact. fully reversible through /reactivate below.
router.post('/inventory/:id/discontinue', async (req, res) => {
  try {
    await db.query(`UPDATE medicines SET status = 'Discontinued' WHERE medicine_id = ?`, [req.params.id]);
    res.redirect('/pharmacist/inventory');
  } catch (err) {
    console.error('Discontinue medicine error:', err);
    await loadInventoryPage(res, req.session.user, { search: '', category: 'All' }, 'Could not remove this medicine from the catalog. Please try again.');
  }
});

// POST /pharmacist/inventory/:id/reactivate
// flips a discontinued medicine back to active, undoes the soft delete above, everything about it (stock, history) was preserved the whole time so there's nothing else to restore.
router.post('/inventory/:id/reactivate', async (req, res) => {
  try {
    await db.query(`UPDATE medicines SET status = 'Active' WHERE medicine_id = ?`, [req.params.id]);
    res.redirect('/pharmacist/inventory');
  } catch (err) {
    console.error('Reactivate medicine error:', err);
    await loadInventoryPage(res, req.session.user, { search: '', category: 'All' }, 'Could not reactivate this medicine. Please try again.');
  }
});

// shared loader for the transactions page, pharmacist's own version of the same four-tab layout staff gets (sale, disposal, delivery, history), reused by the GET route and every POST handler below on both success and failure.
async function loadPharmacistTransactionsPage(res, sessionUser, tab, error = null) {
  const validTabs = ['sale', 'disposal', 'delivery', 'history'];
  const activeTab = validTabs.includes(tab) ? tab : 'sale';

  // discontinued medicines can't be sold or disposed of, so they're left out of this picker same as everywhere else.
  const [medicines] = await db.query(
    `SELECT medicine_id, medicine_name, brand_name, medicine_type, stock_quantity, unit_price, image_path
     FROM medicines WHERE status = 'Active' ORDER BY medicine_name`
  );

  let todaysEntries = [];
  let approvedDeliveries = [];
  let allTransactions = [];

  if (activeTab === 'delivery') {
    [approvedDeliveries] = await db.query(
      `SELECT rr.request_id, rr.quantity_requested, rr.request_date, m.medicine_name
       FROM restock_requests rr
       JOIN medicines m ON rr.medicine_id = m.medicine_id
       WHERE rr.status = 'Approved'
       ORDER BY rr.request_date ASC`
    );
  } else if (activeTab === 'history') {
    [allTransactions] = await db.query(
      `SELECT st.transaction_id, st.transaction_type, st.transaction_quantity, st.transaction_date,
              m.medicine_name, m.stock_quantity, u.first_name, u.last_name
       FROM stock_transactions st
       JOIN medicines m ON st.medicine_id = m.medicine_id
       JOIN users u ON st.user_id = u.user_id
       ORDER BY st.transaction_date DESC
       LIMIT 50`
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

  res.render('pharmacist/transactions', {
    user: sessionUser,
    tab: activeTab,
    medicines,
    todaysEntries,
    approvedDeliveries,
    allTransactions,
    error
  });
}

// GET /pharmacist/transactions
router.get('/transactions', async (req, res) => {
  try {
    await loadPharmacistTransactionsPage(res, req.session.user, req.query.tab);
  } catch (err) {
    console.error('Transactions load error:', err);
    res.render('pharmacist/transactions', {
      user: req.session.user,
      tab: 'sale',
      medicines: [],
      todaysEntries: [],
      approvedDeliveries: [],
      allTransactions: [],
      error: 'Could not load transactions. Please try again.'
    });
  }
});

// POST /pharmacist/transactions/sale
// records one sale and knocks the quantity off stock, same FOR UPDATE row locking as staff's version so two people ringing up the same medicine at once can't both work off a stale stock number.
router.post('/transactions/sale', async (req, res) => {
  const { medicine_id, quantity } = req.body;
  const qty = Number(quantity);

  if (!medicine_id || !qty || qty <= 0) {
    return loadPharmacistTransactionsPage(res, req.session.user, 'sale', 'Please select a medicine and enter a valid quantity.');
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
      return loadPharmacistTransactionsPage(res, req.session.user, 'sale', 'That medicine no longer exists.');
    }
    if (qty > medicine.stock_quantity) {
      await connection.rollback();
      return loadPharmacistTransactionsPage(res, req.session.user, 'sale', `Only ${medicine.stock_quantity} units in stock — can't sell ${qty}.`);
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
    res.redirect('/pharmacist/transactions?tab=sale');
  } catch (err) {
    console.error('Record sale error:', err);
    if (connection) { try { await connection.rollback(); } catch (rollbackErr) { console.error(rollbackErr); } }
    await loadPharmacistTransactionsPage(res, req.session.user, 'sale', 'Could not record this sale. Please try again.');
  } finally {
    if (connection) connection.release();
  }
});

// POST /pharmacist/transactions/disposal
// same locking pattern as the sale route, but for stock getting thrown out instead of sold, and it requires a reason since a disposal needs a paper trail explaining why the stock is gone.
router.post('/transactions/disposal', async (req, res) => {
  const { medicine_id, quantity, disposal_reason } = req.body;
  const qty = Number(quantity);

  if (!medicine_id || !qty || qty <= 0 || !disposal_reason) {
    return loadPharmacistTransactionsPage(res, req.session.user, 'disposal', 'Please select a medicine, enter a valid quantity, and provide a reason.');
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
      return loadPharmacistTransactionsPage(res, req.session.user, 'disposal', 'That medicine no longer exists.');
    }
    if (qty > medicine.stock_quantity) {
      await connection.rollback();
      return loadPharmacistTransactionsPage(res, req.session.user, 'disposal', `Only ${medicine.stock_quantity} units in stock — can't dispose ${qty}.`);
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
    res.redirect('/pharmacist/transactions?tab=disposal');
  } catch (err) {
    console.error('Record disposal error:', err);
    if (connection) { try { await connection.rollback(); } catch (rollbackErr) { console.error(rollbackErr); } }
    await loadPharmacistTransactionsPage(res, req.session.user, 'disposal', 'Could not record this disposal. Please try again.');
  } finally {
    if (connection) connection.release();
  }
});

// POST /pharmacist/transactions/checkin/:id
// needs the actually-received quantity from the confirm delivery popup before stock moves, we don't just trust the original requested quantity since real deliveries can come up short or over.
router.post('/transactions/checkin/:id', async (req, res) => {
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

  res.redirect('/pharmacist/transactions?tab=delivery');
});

// ── settings ─────────────────────────────────────────────────

// GET /pharmacist/settings
router.get('/settings', async (req, res) => {
  try {
    const [[profile]] = await db.query(
      `SELECT first_name, last_name, username, email, position, status FROM users WHERE user_id = ?`,
      [req.session.user.user_id]
    );
    res.render('pharmacist/settings', { user: req.session.user, profile, error: null, success: null });
  } catch (err) {
    console.error('Settings load error:', err);
    res.render('pharmacist/settings', {
      user: req.session.user,
      profile: req.session.user,
      error: 'Could not load settings. Please try again.',
      success: null
    });
  }
});

// POST /pharmacist/settings
// updates the pharmacist's own profile and, optionally, their password, all from the one Save button on the page.
router.post('/settings', async (req, res) => {
  const {
    first_name, last_name, username, email,
    current_password, new_password, confirm_password
  } = req.body;

  const rerender = (error, success, profileOverride) => {
    res.render('pharmacist/settings', {
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
    res.render('pharmacist/settings', {
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

// ── notifications (bell dropdown) ─────────────────────────────
// computed live from current inventory/restock state since there's no notifications table, so "recent" here really just means "currently true".
function plural(n, word, pluralWord) {
  return n === 1 ? word : (pluralWord || word + 's');
}

router.get('/notifications', async (req, res) => {
  try {
    const notifications = [];

    const [[{ lowStock }]] = await db.query(
      `SELECT COUNT(*) AS lowStock FROM medicines WHERE stock_quantity < stock_threshold AND status = 'Active'`
    );
    const [[{ expiringSoon }]] = await db.query(
      `SELECT COUNT(*) AS expiringSoon FROM medicines
       WHERE expiration_date IS NOT NULL
         AND expiration_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
         AND status = 'Active'`
    );
    const [[{ pendingRestocks }]] = await db.query(
      `SELECT COUNT(*) AS pendingRestocks FROM restock_requests WHERE status = 'Pending'`
    );
    const [[{ approvedAwaitingDelivery }]] = await db.query(
      `SELECT COUNT(*) AS approvedAwaitingDelivery FROM restock_requests WHERE status = 'Approved'`
    );

    if (pendingRestocks > 0) {
      notifications.push({
        icon: 'package-search', type: 'warning',
        title: `${pendingRestocks} restock ${plural(pendingRestocks, 'request')} need your approval`,
        link: '/pharmacist/restock-requests?tab=Pending'
      });
    }
    if (lowStock > 0) {
      notifications.push({
        icon: 'triangle-alert', type: 'warning',
        title: `${lowStock} ${plural(lowStock, 'medicine')} running low on stock`,
        link: '/pharmacist/inventory'
      });
    }
    if (expiringSoon > 0) {
      notifications.push({
        icon: 'calendar-clock', type: 'warning',
        title: `${expiringSoon} ${plural(expiringSoon, 'medicine')} expiring within 30 days`,
        link: '/pharmacist/inventory'
      });
    }
    if (approvedAwaitingDelivery > 0) {
      notifications.push({
        icon: 'truck', type: 'info',
        title: `${approvedAwaitingDelivery} ${plural(approvedAwaitingDelivery, 'delivery', 'deliveries')} awaiting check-in`,
        link: '/pharmacist/transactions?tab=delivery'
      });
    }

    res.json({ notifications });
  } catch (err) {
    console.error('Pharmacist notifications error:', err);
    res.status(500).json({ notifications: [] });
  }
});

module.exports = router;

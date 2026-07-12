// routes/pharmacist.js
const express         = require('express');
const router           = express.Router();
const multer           = require('multer');
const path              = require('path');
const isAuthenticated  = require('../middleware/authMiddleware');
const authorizeRole    = require('../middleware/roleMiddleware');
const db               = require('../db/connection');
const { confirmDelivery } = require('../utils/confirmDelivery');

// All pharmacist routes require login + Pharmacist role
router.use(isAuthenticated);
router.use(authorizeRole(['Pharmacist']));

// ── Medicine image upload ───────────────────────────────────────
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP, or AVIF images are allowed.'));
  }
});

// Wraps upload.single so multer errors (bad file type, too large) show
// as a normal page error instead of crashing the request.
function uploadMedicineImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    console.error('Image upload error:', err);
    loadInventoryPage(res, req.session.user, { search: '', category: 'All' }, err.message || 'Could not upload the image.')
      .catch(() => res.redirect('/pharmacist/inventory'));
  });
}

// GET /pharmacist/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const [[{ totalMedicines }]] = await db.query(
      `SELECT COUNT(*) AS totalMedicines FROM medicines`
    );

    const [[{ lowStock }]] = await db.query(
      `SELECT COUNT(*) AS lowStock FROM medicines WHERE stock_quantity < stock_threshold`
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
      `SELECT rr.request_id, rr.quantity_requested, rr.request_date, m.medicine_name
       FROM restock_requests rr
       JOIN medicines m ON rr.medicine_id = m.medicine_id
       WHERE rr.status = 'Pending'
       ORDER BY rr.request_date ASC
       LIMIT 10`
    );

    res.render('pharmacist/dashboard', {
      user: req.session.user,
      stats: { totalMedicines, lowStock, expiringSoon, pendingRestocks },
      lowStockItems,
      nearExpiryItems,
      pendingRestockItems,
      error: null
    });
  } catch (err) {
    console.error('Pharmacist dashboard load error:', err);
    res.render('pharmacist/dashboard', {
      user: req.session.user,
      stats: { totalMedicines: 0, lowStock: 0, expiringSoon: 0, pendingRestocks: 0 },
      lowStockItems: [],
      nearExpiryItems: [],
      pendingRestockItems: [],
      error: 'Could not load dashboard data. Please try again.'
    });
  }
});

// Redirects back to wherever the action was triggered from (Dashboard or
// the Restock Requests page), falling back if return_to is missing/unsafe.
function safeRedirect(req, res, fallback) {
  const returnTo = req.body.return_to;
  const isSafe = returnTo
    && (returnTo.startsWith('/pharmacist/dashboard') || returnTo.startsWith('/pharmacist/restock-requests'));
  res.redirect(isSafe ? returnTo : fallback);
}

// ── Shared loader for the Restock Requests page ─────────────────
async function loadRestockRequestsPage(res, sessionUser, tab, error = null) {
  const validTabs = ['Pending', 'Approved', 'Completed', 'Cancelled'];
  const activeTab = validTabs.includes(tab) ? tab : 'Pending';

  const [requests] = await db.query(
    `SELECT rr.request_id, rr.quantity_requested, rr.request_date, rr.notes,
            m.medicine_name, c.category_name, st.transaction_quantity AS quantity_received
     FROM restock_requests rr
     JOIN medicines m ON rr.medicine_id = m.medicine_id
     LEFT JOIN categories c ON m.category_id = c.category_id
     LEFT JOIN stock_transactions st ON st.request_id = rr.request_id AND st.transaction_type = 'restock'
     WHERE rr.status = ?
     ORDER BY rr.request_date DESC`,
    [activeTab]
  );

  const [medicines] = await db.query(
    `SELECT medicine_id, medicine_name, stock_quantity, stock_threshold FROM medicines ORDER BY medicine_name`
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

// POST /pharmacist/restock-requests — create a new request
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
// The Pending tab's Requested Qty column is an editable input tied to
// this form via the `form` attribute — whatever value is in it at
// submit time (system suggestion or a Pharmacist edit) overwrites
// quantity_requested. Forms without that field (e.g. the Dashboard's
// Approve button) just update status, leaving quantity untouched.
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
router.post('/restock-requests/:id/dismiss', async (req, res) => {
  try {
    await db.query(
      `UPDATE restock_requests SET status = 'Cancelled' WHERE request_id = ? AND status = 'Pending'`,
      [req.params.id]
    );
  } catch (err) {
    console.error('Dismiss restock request error:', err);
  }
  safeRedirect(req, res, '/pharmacist/dashboard');
});

// POST /pharmacist/restock-requests/:id/confirm-delivery
// Same verification step and stock-moving logic as the Staff Transactions
// page's Delivery Check-in — requires the actually-received quantity
// before the request is completed and stock is updated.
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

// ── Shared loader for the Inventory page ────────────────────────
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

  const [medicines] = await db.query(
    `SELECT m.medicine_id, m.medicine_name, m.brand_name, m.medicine_type, m.dose,
            m.description, m.unit_price, m.stock_quantity, m.stock_threshold,
            m.expiration_date, m.image_path,
            c.category_id, c.category_name,
            s.supplier_id, s.company_name AS supplier_name, s.phone_number AS supplier_phone
     FROM medicines m
     LEFT JOIN categories c ON m.category_id = c.category_id
     LEFT JOIN suppliers s ON m.supplier_id = s.supplier_id
     ${whereClause}
     ORDER BY c.category_name, m.medicine_name`,
    params
  );

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

// POST /pharmacist/inventory — add a new medicine
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

// POST /pharmacist/inventory/:id — edit an existing medicine
// If no new file is uploaded, existing_image_path (a hidden field carrying
// the medicine's current image_path) is kept so the photo isn't wiped out.
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

// POST /pharmacist/inventory/:id/delete
router.post('/inventory/:id/delete', async (req, res) => {
  try {
    await db.query(`DELETE FROM medicines WHERE medicine_id = ?`, [req.params.id]);
    res.redirect('/pharmacist/inventory');
  } catch (err) {
    console.error('Delete medicine error:', err);
    const message = err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED'
      ? 'Cannot delete this medicine — it has related stock transactions, restock requests, or logs.'
      : 'Could not delete this medicine. Please try again.';
    await loadInventoryPage(res, req.session.user, { search: '', category: 'All' }, message);
  }
});

module.exports = router;

// routes/pharmacist.js
const express         = require('express');
const router           = express.Router();
const multer           = require('multer');
const path              = require('path');
const isAuthenticated  = require('../middleware/authMiddleware');
const authorizeRole    = require('../middleware/roleMiddleware');
const db               = require('../db/connection');

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
       ORDER BY (m.stock_threshold - m.stock_quantity) DESC
       LIMIT 8`
    );

    res.render('pharmacist/dashboard', {
      user: req.session.user,
      stats: { totalMedicines, lowStock, expiringSoon, pendingRestocks },
      lowStockItems,
      error: null
    });
  } catch (err) {
    console.error('Pharmacist dashboard load error:', err);
    res.render('pharmacist/dashboard', {
      user: req.session.user,
      stats: { totalMedicines: 0, lowStock: 0, expiringSoon: 0, pendingRestocks: 0 },
      lowStockItems: [],
      error: 'Could not load dashboard data. Please try again.'
    });
  }
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

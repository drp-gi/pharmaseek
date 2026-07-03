// routes/admin.js
const express       = require('express');
const router        = express.Router();
const isAuthenticated = require('../middleware/authMiddleware');
const authorizeRole   = require('../middleware/roleMiddleware');

// All admin routes require login + Admin role
router.use(isAuthenticated);
router.use(authorizeRole(['Admin']));

// GET /admin/dashboard
router.get('/dashboard', (req, res) => {
  res.render('admin/dashboard', { user: req.session.user });
});

module.exports = router;
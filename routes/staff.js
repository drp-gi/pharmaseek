// routes/staff.js
const express         = require('express');
const router          = express.Router();
const isAuthenticated = require('../middleware/authMiddleware');
const authorizeRole   = require('../middleware/roleMiddleware');

// All staff routes require login + Staff role
router.use(isAuthenticated);
router.use(authorizeRole(['Staff']));

// GET /staff/dashboard
router.get('/dashboard', (req, res) => {
  res.render('staff/dashboard', { user: req.session.user });
});

module.exports = router;
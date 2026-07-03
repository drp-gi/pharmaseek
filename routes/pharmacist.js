// routes/pharmacist.js
const express         = require('express');
const router          = express.Router();
const isAuthenticated = require('../middleware/authMiddleware');
const authorizeRole   = require('../middleware/roleMiddleware');

// All pharmacist routes require login + Pharmacist role
router.use(isAuthenticated);
router.use(authorizeRole(['Pharmacist']));

// GET /pharmacist/dashboard
router.get('/dashboard', (req, res) => {
  res.render('pharmacist/dashboard', { user: req.session.user });
});

module.exports = router;
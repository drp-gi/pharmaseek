// routes/auth.js
const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db/connection');

// ─── GET / → redirect to login ───────────────────────────────────────────────
router.get('/', (req, res) => {
  if (req.session && req.session.user) {
    return redirectToDashboard(res, req.session.user.position);
  }
  return res.redirect('/login');
});

// ─── GET /login ───────────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  // If already logged in, skip login page
  if (req.session && req.session.user) {
    return redirectToDashboard(res, req.session.user.position);
  }
  res.render('auth/login', { error: null });
});

// ─── POST /login ──────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  // Basic input check
  if (!username || !password) {
    return res.render('auth/login', {
      error: 'Please enter both username and password.'
    });
  }

  try {
    // 1. Find user by username
    const [rows] = await db.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      return res.render('auth/login', {
        error: 'Invalid username or password.'
      });
    }

    const user = rows[0];

    // 2. Check if account is active
    if (user.status !== 'Active') {
      return res.render('auth/login', {
        error: 'Your account has been deactivated. Please contact the Admin.'
      });
    }

    // 3. Compare password with stored hash
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.render('auth/login', {
        error: 'Invalid username or password.'
      });
    }

    // 4. Save user info to session
    req.session.user = {
      user_id:    user.user_id,
      username:   user.username,
      first_name: user.first_name,
      last_name:  user.last_name,
      email:      user.email,
      position:   user.position
    };

    // 5. Redirect based on role
    return redirectToDashboard(res, user.position);

  } catch (err) {
    console.error('Login error:', err);
    return res.render('auth/login', {
      error: 'Something went wrong. Please try again.'
    });
  }
});

// ─── POST /logout ─────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login');
  });
});

// ─── Helper: redirect to correct dashboard by role ───────────────────────────
function redirectToDashboard(res, position) {
  const dashboardMap = {
    Admin:      '/admin/dashboard',
    Pharmacist: '/pharmacist/dashboard',
    Staff:      '/staff/dashboard'
  };
  return res.redirect(dashboardMap[position] || '/login');
}

module.exports = router;
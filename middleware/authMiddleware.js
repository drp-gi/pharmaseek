//blocks unauthenticated access, yiii

// middleware/authMiddleware.js
// Blocks any unauthenticated request and redirects to login

const isAuthenticated = (req, res, next) => {
  // Marks every authenticated page as non-cacheable so the browser's
  // back/forward cache won't replay it after logout — pressing Back always
  // forces a fresh request here, which re-checks the session.
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');

  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
};

module.exports = isAuthenticated;
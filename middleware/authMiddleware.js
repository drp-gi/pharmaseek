//blocks unauthenticated access, yiii

// middleware/authMiddleware.js
// Blocks any unauthenticated request and redirects to login

const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login');
};

module.exports = isAuthenticated;
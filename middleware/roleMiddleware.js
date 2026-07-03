//restricts by Admin/Pharmacist/Staff mao daw mo check kinsay ni log in


// middleware/roleMiddleware.js
// Restricts access to specific roles only
// Usage: router.get('/dashboard', isAuthenticated, authorizeRole(['Admin']), handler)

const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }

    const userRole = req.session.user.position;

    if (allowedRoles.includes(userRole)) {
      return next();
    }

    // User is logged in but doesn't have permission for this page
    // Redirect them to their own dashboard instead
    const dashboardMap = {
      Admin:      '/admin/dashboard',
      Pharmacist: '/pharmacist/dashboard',
      Staff:      '/staff/dashboard'
    };

    return res.redirect(dashboardMap[userRole] || '/login');
  };
};

module.exports = authorizeRole;
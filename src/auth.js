// Access control. Roles:
//   admin  — full access to everything
//   field  — Field Users: only "Create a Field Case"
//   viewer — can view everything EXCEPT Talent Management

const MODULE_ACCESS = {
    dashboard: ['admin', 'viewer'],           // Home dashboard
    drafts:    ['admin', 'field'],            // My Drafts (creators)
    field:   ['admin', 'field', 'viewer'], // Create a Field Case (field users create; viewers view)
    support: ['admin', 'viewer'],          // Partnership Support Request
    business:['admin', 'viewer'],          // Business Partners
    talent:  ['admin'],                    // Talent Management (hidden from viewers)
    reports: ['admin', 'viewer'],          // Reporting
    users:   ['admin'],                    // Account management
};

function requireLogin(req, res, next) {
    if (req.session && req.session.adminId) return next();
    return res.redirect('/login');
}

// requireRole('admin', 'viewer') — allow only the listed roles
function requireRole(...roles) {
    return function (req, res, next) {
        if (!req.session || !req.session.adminId) return res.redirect('/login');
        const role = req.session.role || 'admin';
        if (roles.includes(role)) return next();
        return res.status(403).render('403', { adminName: req.session.adminName });
    };
}

// requireModule('talent') — allow roles permitted for that module
function requireModule(mod) {
    const roles = MODULE_ACCESS[mod] || ['admin'];
    return requireRole(...roles);
}

function canAccess(role, mod) {
    const roles = MODULE_ACCESS[mod] || ['admin'];
    return roles.includes(role || 'admin');
}

// Where a user should land after login, based on role
function landingFor(role) {
    if (role === 'field') return '/field';
    return '/dashboard';
}

module.exports = { requireLogin, requireRole, requireModule, canAccess, landingFor, MODULE_ACCESS };

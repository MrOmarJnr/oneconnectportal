require('dotenv').config();

const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const cors = require('cors');
const path = require('path');
const fs = require('fs');

require('./src/db'); // ensures DB + default admin are initialized before routes load

const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const usersRoutes = require('./routes/users');
const moduleRoutes = require('./routes/modules');
const fieldRoutes = require('./routes/field');
const supportRoutes = require('./routes/support');
const businessRoutes = require('./routes/business').router;
const talentRoutes = require('./routes/talent');
const reportRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');
const draftRoutes = require('./routes/drafts');
const { canAccess, landingFor, requireLogin } = require('./src/auth');

const app = express();
const PORT = process.env.PORT || 3000;

const SESSIONS_DIR = path.join(__dirname, 'data', 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    store: new FileStore({ path: SESSIONS_DIR, retries: 1, logFn: () => {} }),
    secret: process.env.SESSION_SECRET || 'change-this-session-secret-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 12, // 12 hours
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
    },
}));


// Expose the signed-in user + role to all views (sidebar uses these)
app.use((req, res, next) => {
    res.locals.currentRole = (req.session && req.session.role) || null;
    res.locals.currentUserId = (req.session && req.session.adminId) || null;
    res.locals.currentUserName = (req.session && req.session.adminName) || null;
    res.locals.currentUserPhoto = (req.session && req.session.photo) || null;
    res.locals.canAccess = canAccess;
    res.locals.activeModule = null;
    next();
});

// CORS for the public submission endpoints only — apply.html and request-support.html
// are static files on a different origin (a different port locally, a different
// domain in production), so the browser needs an explicit CORS allow before it'll
// let those pages POST here. Admin routes below don't need this: the admin visits
// this portal directly (same origin), so the session cookie just works.
// Set ALLOWED_ORIGINS in .env to a comma-separated list once you know your site's
// real domain(s), e.g. "https://unitedinone.org,https://www.unitedinone.org".
// Left unset, every origin is allowed — fine for local testing, but tighten this
// before going to production.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use('/api', cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
}));

// Public submission endpoints — called by apply.html and request-support.html on the main site
app.use('/api', publicRoutes);

// Auth pages
app.use('/', authRoutes);

// Admin portal (protected)
app.use('/admin', adminRoutes);
app.use('/users', usersRoutes);
app.use('/field', fieldRoutes);
app.use('/support', supportRoutes);
app.use('/business', businessRoutes);
app.use('/talent', talentRoutes);
app.use('/reports', reportRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/drafts', draftRoutes);
app.use('/', moduleRoutes);


// Serve the signed-in user's profile photo (if any)
app.get('/me/avatar', requireLogin, (req, res) => {
    const photo = req.session && req.session.photo;
    if (!photo) return res.status(404).end();
    const fp = path.join(__dirname, 'uploads', photo);
    if (!fs.existsSync(fp)) return res.status(404).end();
    res.sendFile(fp);
});

app.get('/', (req, res) => {
    res.redirect(req.session && req.session.adminId ? landingFor(req.session.role) : '/login');
});

app.use((req, res) => {
    res.status(404).render('404');
});

app.listen(PORT, () => {
    console.log(`UIOGF admin portal running at http://localhost:${PORT}`);
});

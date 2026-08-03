require('dotenv').config();

const express = require('express');
const cookieSession = require('cookie-session');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const db = require('./src/db'); // hydrated in the ensureReady middleware below
const { sendStoredName } = require('./src/filestore');

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

// Behind Vercel's proxy — needed so secure session cookies are honored over HTTPS.
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Hydrate the datastore from storage before any route touches it. On Vercel each
// cold start rehydrates from the private Blob; locally it reads data/db.json.
// db.ready() is memoized, so this is effectively free after the first request.
app.use((req, res, next) => {
    db.ready().then(() => next()).catch(next);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Portal's own static assets (admin.css, reports.js, logo).
app.use(express.static(path.join(__dirname, 'public')));

// If the marketing website (../uiogf_rename) sits next to the portal — i.e. when
// running both locally, or if you ever deploy them combined — serve it from this
// same app. When the portal is deployed on its own (its own Vercel project), the
// folder isn't present and this is simply skipped; the website is a separate
// project that proxies /api/submit/* here.
const SITE_DIR = path.join(__dirname, '..', 'uiogf_rename');
if (fs.existsSync(SITE_DIR)) {
    app.use(express.static(SITE_DIR, {
        index: 'index.html',
        setHeaders(res, filePath) {
            if (/\.(css|js|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|eot|pdf)$/i.test(filePath)) {
                res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
            } else {
                res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
            }
        },
    }));
}

// Stateless, signed cookie session — no server-side store, so it survives on
// serverless where the filesystem is ephemeral. Only holds ids/role/name/photo.
app.use(cookieSession({
    name: 'uiogf_sess',
    keys: [process.env.SESSION_SECRET || 'change-this-session-secret-in-production'],
    maxAge: 1000 * 60 * 60 * 12, // 12 hours
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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

// CORS for the public submission endpoints only. The website pages POST here; in
// production lock this down by setting ALLOWED_ORIGINS to your real domain(s),
// e.g. "https://unitedinone.org,https://www.unitedinone.org". Left unset, all
// origins are allowed (fine while testing).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use('/api', cors({ origin: allowedOrigins.length ? allowedOrigins : true }));

// Public submission endpoints — called by the website forms
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
    sendStoredName(res, photo);
});

// If the website index.html is somehow missing, fall back to the portal login.
app.get('/', (req, res) => {
    res.redirect(req.session && req.session.adminId ? landingFor(req.session.role) : '/login');
});

app.use((req, res) => {
    res.status(404).render('404');
});

// Export the app for Vercel's serverless entry (api/index.js). Only start a
// listener when run directly (local `npm start` / `npm run dev`).
module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`UIOGF site + portal running at http://localhost:${PORT}`);
    });
}

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../src/db');
const { requireModule, ROLES } = require('../src/auth');
const mailer = require('../src/mailer');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOAD_DIR),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname)}`),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
});

// All user-management routes are admin-only
router.use(requireModule('users'));

function render(res, extra = {}) {
    res.render('users', Object.assign({
        users: db.listAdmins(),
        roles: db.ROLES,
        error: null,
        notice: null,
    }, extra));
}

router.get('/', (req, res) => {
    const notice = req.session.userNotice || null;
    req.session.userNotice = null;
    render(res, { notice });
});

// Create a new account with a unique login + password
router.post('/create', upload.single('photo'), async (req, res) => {
    const { name, email, role, password } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanName || !cleanEmail || !password) {
        return render(res, { error: 'Name, email, and password are all required.' });
    }
    if (!db.ROLES.includes(role)) {
        return render(res, { error: 'Please choose a valid role.' });
    }
    if (db.getAdminByEmail(cleanEmail)) {
        return render(res, { error: 'An account with that email already exists.' });
    }
    if (String(password).length < 8) {
        return render(res, { error: 'Password must be at least 8 characters.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const photo = req.file ? req.file.filename : '';
    db.insertAdmin({ name: cleanName, email: cleanEmail, password_hash: hash, role, photo });

    let emailNote = '';
    try {
        const tpl = mailer.credentialsEmail({ name: cleanName, email: cleanEmail, password, role });
        const r = await mailer.sendMail({ to: cleanEmail, subject: tpl.subject, html: tpl.html });
        emailNote = r && r.ok ? ' Login details were emailed to them.' : ' (Email not sent — check RESEND_API_KEY.)';
    } catch (e) { emailNote = ' (Email failed to send.)'; }

    req.session.userNotice = `Account created for ${cleanName} (${cleanEmail}).` + emailNote;
    res.redirect('/users');
});

// Reset / set a user's password. If no password supplied, generate a temporary one.
router.post('/:id/reset-password', async (req, res) => {
    const user = db.getAdminById(req.params.id);
    if (!user) return render(res, { error: 'User not found.' });

    let password = (req.body.password || '').trim();
    let generated = false;
    if (!password) {
        password = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + '9!';
        generated = true;
    } else if (password.length < 8) {
        return render(res, { error: 'Password must be at least 8 characters.' });
    }

    db.updateAdminPassword(user.id, bcrypt.hashSync(password, 10));

    let emailNote = '';
    try {
        const tpl = mailer.passwordResetByAdminEmail({ name: user.name, email: user.email, password });
        const r = await mailer.sendMail({ to: user.email, subject: tpl.subject, html: tpl.html });
        emailNote = r && r.ok ? ' The new password was emailed to them.' : ' (Email not sent — share it securely.)';
    } catch (e) { emailNote = ' (Email failed — share it securely.)'; }

    req.session.userNotice = generated
        ? `Temporary password for ${user.name}: ${password}.` + emailNote
        : `Password updated for ${user.name}.` + emailNote;
    res.redirect('/users');
});

// Change a user's role
router.post('/:id/role', (req, res) => {
    const user = db.getAdminById(req.params.id);
    if (!user) return render(res, { error: 'User not found.' });
    if (user.id === req.session.adminId && req.body.role !== 'admin') {
        return render(res, { error: "You can't remove your own admin access." });
    }
    db.updateAdmin(user.id, { role: req.body.role });
    req.session.userNotice = `${user.name} is now a ${req.body.role}.`;
    res.redirect('/users');
});

// Activate / deactivate an account
router.post('/:id/status', (req, res) => {
    const user = db.getAdminById(req.params.id);
    if (!user) return render(res, { error: 'User not found.' });
    if (user.id === req.session.adminId) {
        return render(res, { error: "You can't deactivate your own account." });
    }
    const status = req.body.status === 'inactive' ? 'inactive' : 'active';
    db.updateAdmin(user.id, { status });
    req.session.userNotice = `${user.name} is now ${status}.`;
    res.redirect('/users');
});

// Serve a user's profile photo
router.get('/avatar/:id', (req, res) => {
    const user = db.getAdminById(req.params.id);
    if (!user || !user.photo) return res.status(404).end();
    const fp = path.join(UPLOAD_DIR, user.photo);
    if (!fs.existsSync(fp)) return res.status(404).end();
    res.sendFile(fp);
});

module.exports = router;

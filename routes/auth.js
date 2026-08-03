const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { landingFor } = require('../src/auth');
const crypto = require('crypto');
const mailer = require('../src/mailer');

const router = express.Router();

router.get('/login', (req, res) => {
    if (req.session && req.session.adminId) {
        return res.redirect(landingFor(req.session.role));
    }
    res.render('login', { error: null });
});

router.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.render('login', { error: 'Please enter your email and password.' });
    }

    const admin = db.getAdminByEmail(email.trim().toLowerCase());

    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
        return res.render('login', { error: 'Incorrect email or password.' });
    }

    if (admin.status === 'inactive') {
        return res.render('login', { error: 'This account has been deactivated. Contact an administrator.' });
    }

    req.session.adminId = admin.id;
    req.session.adminName = admin.name;
    req.session.role = admin.role;
    req.session.photo = admin.photo || '';
    res.redirect(landingFor(admin.role));
});

router.post('/logout', (req, res) => {
    req.session = null; // cookie-session: clearing the cookie ends the session
    res.redirect('/login');
});


// ---------- Forgot / reset password ----------
router.get('/forgot', (req, res) => {
    if (req.session && req.session.adminId) return res.redirect(landingFor(req.session.role));
    res.render('forgot', { sent: false, error: null });
});

router.post('/forgot', async (req, res) => {
    const email = (req.body.email || '').trim().toLowerCase();
    // Always respond the same way (don't reveal whether an account exists)
    try {
        const user = email && db.getAdminByEmail(email);
        if (user && user.status !== 'inactive') {
            const token = crypto.randomBytes(24).toString('hex');
            const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
            db.setResetToken(user.id, token, expires);
            const link = `${mailer.PORTAL_URL}/reset/${token}`;
            const tpl = mailer.resetEmail({ name: user.name, link });
            await mailer.sendMail({ to: user.email, subject: tpl.subject, html: tpl.html });
        }
    } catch (err) { console.error('[forgot]', err.message); }
    res.render('forgot', { sent: true, error: null });
});

router.get('/reset/:token', (req, res) => {
    const user = db.getAdminByResetToken(req.params.token);
    if (!user) return res.render('reset', { token: null, error: 'This reset link is invalid or has expired.' });
    res.render('reset', { token: req.params.token, error: null });
});

router.post('/reset/:token', (req, res) => {
    const user = db.getAdminByResetToken(req.params.token);
    if (!user) return res.render('reset', { token: null, error: 'This reset link is invalid or has expired.' });
    const pw = (req.body.password || '').trim();
    const confirm = (req.body.confirm || '').trim();
    if (pw.length < 8) return res.render('reset', { token: req.params.token, error: 'Password must be at least 8 characters.' });
    if (pw !== confirm) return res.render('reset', { token: req.params.token, error: 'Passwords do not match.' });
    db.updateAdminPassword(user.id, bcrypt.hashSync(pw, 10));
    db.clearResetToken(user.id);
    res.render('login', { error: null, notice: 'Password updated — you can now sign in.' });
});

module.exports = router;

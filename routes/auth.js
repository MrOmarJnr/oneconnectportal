const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { landingFor } = require('../src/auth');

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
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

module.exports = router;

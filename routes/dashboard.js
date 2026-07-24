const express = require('express');
const reports = require('../src/reports');
const { requireModule } = require('../src/auth');

const router = express.Router();

router.get('/', requireModule('dashboard'), (req, res) => {
    res.render('dashboard_home', {
        R: reports.build(),
        activeModule: 'dashboard',
        adminName: req.session.adminName,
    });
});

module.exports = router;

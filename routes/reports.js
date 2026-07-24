const express = require('express');
const reports = require('../src/reports');
const { requireModule } = require('../src/auth');

const router = express.Router();
router.use(requireModule('reports')); // admin + viewer

const TABS = ['overview', 'field', 'support', 'business', 'talent'];

router.get('/', (req, res) => res.redirect('/reports/overview'));
router.get('/:tab', (req, res) => {
    const tab = TABS.includes(req.params.tab) ? req.params.tab : 'overview';
    res.render('reports/' + tab, {
        R: reports.build(), reportTab: tab,
        activeModule: 'reports', adminName: req.session.adminName,
    });
});

module.exports = router;

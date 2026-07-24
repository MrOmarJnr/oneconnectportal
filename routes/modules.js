// Placeholder module pages so the new menu is fully navigable.
// Each will be replaced with its real implementation in later phases.
const express = require('express');
const { requireModule } = require('../src/auth');

const router = express.Router();

const PAGES = {
};

Object.keys(PAGES).forEach((mod) => {
    router.get('/' + mod, requireModule(mod), (req, res) => {
        res.render('module-placeholder', {
            adminName: req.session.adminName,
            page: PAGES[mod],
            activeModule: mod,
        });
    });
});

module.exports = router;

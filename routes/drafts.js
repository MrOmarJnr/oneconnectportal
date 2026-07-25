const express = require('express');
const multer = require('multer');
const db = require('../src/db');
const { requireLogin } = require('../src/auth');

const router = express.Router();
const upload = multer(); // parse multipart text fields; ignore files

// Maps each draft module to its create page + a title deriver
const MODULES = {
    field:     { path: '/field/new',              label: 'Field Case',       title: (d) => d.location_name || d.field_partner || 'Field case' },
    support:   { path: '/support/new',            label: 'Support Request',  title: (d) => d.organization_name || d.contact_name || 'Support request' },
    business:  { path: '/business/new',           label: 'Business Partner', title: (d) => d.partner_name || d.contact_name || 'Business partner' },
    staff:     { path: '/talent/staff/new',       label: 'Staff Profile',    title: (d) => d.full_name || 'Staff profile' },
    volunteer: { path: '/talent/volunteers/new',  label: 'Volunteer',        title: (d) => d.full_name || 'Volunteer' },
};

router.use(requireLogin);

router.get('/', (req, res) => {
    const drafts = db.listDraftsByOwner(req.session.adminId).map((d) => {
        const m = MODULES[d.module] || { path: '#', label: d.module };
        return Object.assign({}, d, { continueUrl: `${m.path}?draft=${d.id}`, moduleLabel: m.label });
    });
    res.render('drafts/list', {
        drafts, activeModule: 'drafts', adminName: req.session.adminName,
        notice: (function () { const n = req.session.draftNotice; req.session.draftNotice = null; return n || null; })(),
    });
});

// Save (create or update) a draft — invoked via formaction from the create forms
router.post('/save', upload.any(), (req, res) => {
    const mod = req.query.module;
    if (!MODULES[mod]) return res.status(400).send('Unknown module');
    const body = Object.assign({}, req.body);
    const draftId = body._draftId; delete body._draftId; delete body._action;
    const title = MODULES[mod].title(body);
    const existing = draftId ? db.getDraft(draftId) : null;
    if (existing && existing.owner_id === req.session.adminId) {
        db.updateDraft(existing.id, { title, data: body });
    } else {
        db.createDraft({ module: mod, owner_id: req.session.adminId, owner_name: req.session.adminName, title, data: body });
    }
    req.session.draftNotice = 'Draft saved. You can continue it anytime from Drafts.';
    res.redirect('/drafts');
});

router.post('/:id/delete', (req, res) => {
    const d = db.getDraft(req.params.id);
    if (d && d.owner_id === req.session.adminId) db.deleteDraft(d.id);
    req.session.draftNotice = 'Draft deleted.';
    res.redirect('/drafts');
});

module.exports = router;

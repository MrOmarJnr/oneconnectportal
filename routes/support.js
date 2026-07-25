const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('../src/db');
const fmt = require('../src/format');
const { requireModule, requireRole } = require('../src/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024, files: 10 } });

const WORK_STATUSES = ['new', 'in_progress', 'closed'];
const WORK_LABEL = { new: 'New', in_progress: 'In Progress', closed: 'Closed' };

const SUPPORT_FIELDS = [
    { group: 'Organization', fields: [
        { key: 'organization_name', label: 'Organization Name', type: 'text', required: true },
        { key: 'organization_type', label: 'Organization Type', type: 'text' },
        { key: 'country', label: 'Country', type: 'text' },
        { key: 'region', label: 'Region / State', type: 'text' },
        { key: 'city', label: 'City / Town', type: 'text' },
        { key: 'website', label: 'Website', type: 'text' },
    ] },
    { group: 'Primary Contact', fields: [
        { key: 'contact_name', label: 'Full Name', type: 'text' },
        { key: 'contact_title', label: 'Title / Role', type: 'text' },
        { key: 'contact_email', label: 'Email', type: 'text' },
        { key: 'contact_phone', label: 'Phone', type: 'text' },
        { key: 'contact_method', label: 'Preferred Contact Method', type: 'text' },
    ] },
    { group: 'Community Need', fields: [
        { key: 'need_areas', label: 'Areas Needing Support', type: 'text' },
        { key: 'situation_description', label: 'Description of Situation', type: 'textarea' },
        { key: 'people_impacted', label: 'People Impacted', type: 'text' },
        { key: 'age_range', label: 'Estimated Age Range', type: 'text' },
    ] },
    { group: 'Partnership', fields: [
        { key: 'partnership_type', label: 'Type of Partnership Sought', type: 'text' },
        { key: 'timeline', label: 'Timeline / Urgency', type: 'text' },
    ] },
];
const ALL_KEYS = SUPPORT_FIELDS.reduce((a, g) => a.concat(g.fields.map((f) => f.key)), []);

function workStatusOf(row) { return WORK_STATUSES.includes(row.data && row.data.work_status) ? row.data.work_status : 'new'; }

// ---- List ----
router.get('/', requireModule('support'), (req, res) => {
    const statusFilter = WORK_STATUSES.includes(req.query.status) ? req.query.status : 'all';
    const q = (req.query.q || '').trim();
    let rows = db.listSubmissions({ type: 'support', q });
    if (statusFilter !== 'all') rows = rows.filter((r) => workStatusOf(r) === statusFilter);
    const all = db.listSubmissions({ type: 'support' });
    const counts = {
        all: all.length,
        new: all.filter((r) => workStatusOf(r) === 'new').length,
        in_progress: all.filter((r) => workStatusOf(r) === 'in_progress').length,
        closed: all.filter((r) => workStatusOf(r) === 'closed').length,
    };
    res.render('support/list', {
        rows, counts, statusFilter, q,
        fileCountMap: db.getFileCountsMap(),
        WORK_STATUSES, WORK_LABEL, workStatusOf,
        canCreate: req.session.role === 'admin',
        activeModule: 'support', adminName: req.session.adminName,
        notice: (function () { const n = req.session.supportNotice; req.session.supportNotice = null; return n || null; })(),
    });
});

// ---- Field-partner manager (admin) ----
router.get('/partners', requireRole('admin'), (req, res) => {
    res.render('support/partners', {
        partners: db.listFieldPartners(), activeModule: 'support', adminName: req.session.adminName,
        notice: (function () { const n = req.session.supportNotice; req.session.supportNotice = null; return n || null; })(),
    });
});
router.post('/partners/add', requireRole('admin'), (req, res) => {
    db.addFieldPartner(req.body.name);
    req.session.supportNotice = 'Field partner added.';
    res.redirect('/support/partners');
});
router.post('/partners/:id/rename', requireRole('admin'), (req, res) => {
    db.updateFieldPartner(req.params.id, { name: req.body.name });
    res.redirect('/support/partners');
});
router.post('/partners/:id/toggle', requireRole('admin'), (req, res) => {
    const p = db.listFieldPartners().find((x) => x.id === Number(req.params.id));
    if (p) db.updateFieldPartner(p.id, { active: !(p.active !== false) });
    res.redirect('/support/partners');
});
router.post('/partners/:id/remove', requireRole('admin'), (req, res) => {
    db.removeFieldPartner(req.params.id);
    req.session.supportNotice = 'Field partner removed.';
    res.redirect('/support/partners');
});

// ---- Manual create (admin) ----
router.get('/new', requireRole('admin'), (req, res) => {
    let data = {}, draftId = '';
    if (req.query.draft) { const dr = db.getDraft(req.query.draft); if (dr && dr.owner_id === req.session.adminId && dr.module === 'support') { data = dr.data || {}; draftId = dr.id; } }
    res.render('support/new', {
        groups: SUPPORT_FIELDS, partners: db.listFieldPartners({ activeOnly: true }),
        WORK_STATUSES, WORK_LABEL, error: null, data, draftId,
        activeModule: 'support', adminName: req.session.adminName,
    });
});
router.post('/new', requireRole('admin'), upload.array('documents', 10), (req, res) => {
    const data = {};
    ALL_KEYS.forEach((k) => { data[k] = (req.body[k] || '').toString().trim(); });
    data.source = 'manual';
    data.work_status = WORK_STATUSES.includes(req.body.work_status) ? req.body.work_status : 'new';
    data.assigned_to = (req.body.assigned_to || '').toString().trim();
    data._created_by_name = req.session.adminName;
    if (!data.organization_name && !data.contact_name) {
        return res.status(400).render('support/new', {
            groups: SUPPORT_FIELDS, partners: db.listFieldPartners({ activeOnly: true }),
            WORK_STATUSES, WORK_LABEL, activeModule: 'support', adminName: req.session.adminName,
            error: 'Enter at least an organization or contact name.', data: req.body || {}, draftId: (req.body && req.body._draftId) || '',
        });
    }
    const id = db.insertSubmission({
        type: 'support',
        display_name: fmt.displayNameFor('support', data),
        display_subtitle: fmt.displaySubtitleFor('support', data),
        data,
    });
    if (req.files && req.files.length) db.insertFiles(id, req.files);
    req.session.supportNotice = 'Support request created.';
    res.redirect('/support/' + id);
});

// ---- Detail ----
router.get('/:id', requireModule('support'), (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'support') return res.status(404).render('404');
    res.render('support/detail', {
        sub,
        sections: fmt.buildSections('support', sub.data),
        consent: fmt.buildConsent('support', sub.data),
        files: db.getFilesBySubmission(sub.id),
        partners: db.listFieldPartners({ activeOnly: true }),
        workStatus: workStatusOf(sub),
        WORK_STATUSES, WORK_LABEL,
        canManage: req.session.role === 'admin',
        activeModule: 'support', adminName: req.session.adminName,
    });
});

router.post('/:id/assign', requireRole('admin'), (req, res) => {
    const assigned = (req.body.assigned_other || '').trim() || (req.body.assigned_to || '').trim();
    const patch = { assigned_to: assigned };
    if (WORK_STATUSES.includes(req.body.work_status)) {
        patch.work_status = req.body.work_status;
        const cur = db.getSubmissionById(req.params.id);
        if (req.body.work_status === 'closed' && cur && !(cur.data && cur.data.closed_at)) patch.closed_at = new Date().toISOString();
        if (req.body.work_status !== 'closed') patch.closed_at = '';
    }
    db.updateSubmissionData(req.params.id, patch);
    req.session.supportNotice = 'Assignment updated.';
    res.redirect('/support/' + req.params.id);
});

// ---- File download ----
router.get('/files/:id', requireModule('support'), (req, res) => {
    const file = db.getFileById(req.params.id);
    if (!file) return res.status(404).send('File not found');
    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).send('File missing on disk');
    res.setHeader('Content-Disposition', `inline; filename="${file.original_name.replace(/"/g, '')}"`);
    res.sendFile(filePath);
});

router.use((err, req, res, next) => { if (err) return res.status(400).send('Error: ' + err.message); next(); });

module.exports = router;

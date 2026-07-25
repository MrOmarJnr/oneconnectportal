const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('../src/db');
const { requireModule, requireRole } = require('../src/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024, files: 10 } });

const STATUSES = ['prospective', 'active', 'inactive'];
const STATUS_LABEL = { prospective: 'Prospective', active: 'Active', inactive: 'Inactive' };
const SUPPORT_TYPES = ['In-kind', 'Financial', 'Product donation'];

const FIELDS = [
    { group: 'Company', fields: [
        { key: 'partner_name', label: 'Business / Company Name', type: 'text', required: true },
        { key: 'industry', label: 'Industry', type: 'text' },
        { key: 'country', label: 'Country', type: 'text' },
        { key: 'website', label: 'Website', type: 'text' },
    ] },
    { group: 'Primary Contact', fields: [
        { key: 'contact_name', label: 'Contact Name', type: 'text' },
        { key: 'contact_title', label: 'Title / Role', type: 'text' },
        { key: 'contact_email', label: 'Email', type: 'text' },
        { key: 'contact_phone', label: 'Phone', type: 'text' },
    ] },
    { group: 'Partnership', fields: [
        { key: 'donation_amount', label: 'Financial Donation Amount (USD)', type: 'number' },
        { key: 'partner_since', label: 'Partner Since', type: 'date' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
    ] },
];
const SCALAR_KEYS = FIELDS.reduce((a, g) => a.concat(g.fields.map((f) => f.key)), []);

function statusOf(row) { return STATUSES.includes(row.data && row.data.status) ? row.data.status : 'prospective'; }
function toArray(v) { return v === undefined || v === null || v === '' ? [] : (Array.isArray(v) ? v : [v]); }

function collect(body) {
    const data = {};
    SCALAR_KEYS.forEach((k) => { data[k] = (body[k] || '').toString().trim(); });
    data.support_type = toArray(body.support_type);
    data.status = STATUSES.includes(body.status) ? body.status : 'prospective';
    return data;
}
function nameSub(data) {
    return {
        display_name: data.partner_name || data.contact_name || 'Unnamed Partner',
        display_subtitle: [data.country, (data.support_type || []).join(', ')].filter(Boolean).join(' • ') || 'Business Partner',
    };
}

// ---- List ----
router.get('/', requireModule('business'), (req, res) => {
    const statusFilter = STATUSES.includes(req.query.status) ? req.query.status : 'all';
    const q = (req.query.q || '').trim();
    let rows = db.listSubmissions({ type: 'business', q });
    if (statusFilter !== 'all') rows = rows.filter((r) => statusOf(r) === statusFilter);
    const all = db.listSubmissions({ type: 'business' });
    const counts = {
        all: all.length,
        prospective: all.filter((r) => statusOf(r) === 'prospective').length,
        active: all.filter((r) => statusOf(r) === 'active').length,
        inactive: all.filter((r) => statusOf(r) === 'inactive').length,
    };
    res.render('business/list', {
        rows, counts, statusFilter, q, fileCountMap: db.getFileCountsMap(),
        STATUSES, STATUS_LABEL, statusOf,
        canManage: req.session.role === 'admin',
        activeModule: 'business', adminName: req.session.adminName,
        notice: (function () { const n = req.session.bizNotice; req.session.bizNotice = null; return n || null; })(),
    });
});

// ---- Create ----
router.get('/new', requireRole('admin'), (req, res) => {
    let data = {}, draftId = '';
    if (req.query.draft) { const dr = db.getDraft(req.query.draft); if (dr && dr.owner_id === req.session.adminId && dr.module === 'business') { data = dr.data || {}; draftId = dr.id; } }
    res.render('business/form', {
        mode: 'new', id: '', groups: FIELDS, data, draftId, SUPPORT_TYPES, STATUSES, STATUS_LABEL,
        error: null, activeModule: 'business', adminName: req.session.adminName,
    });
});
router.post('/new', requireRole('admin'), upload.array('documents', 10), (req, res) => {
    const data = collect(req.body);
    data.source = 'manual';
    data._created_by_name = req.session.adminName;
    if (!data.partner_name) {
        return res.status(400).render('business/form', {
            mode: 'new', groups: FIELDS, data, SUPPORT_TYPES, STATUSES, STATUS_LABEL,
            error: 'Business / company name is required.', activeModule: 'business', adminName: req.session.adminName,
        });
    }
    const ns = nameSub(data);
    const id = db.insertSubmission({ type: 'business', display_name: ns.display_name, display_subtitle: ns.display_subtitle, data });
    if (req.files && req.files.length) db.insertFiles(id, req.files);
    req.session.bizNotice = 'Business partner created.';
    res.redirect('/business/' + id);
});

// ---- Edit ----
router.get('/:id/edit', requireRole('admin'), (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'business') return res.status(404).render('404');
    res.render('business/form', {
        mode: 'edit', id: sub.id, groups: FIELDS, data: sub.data, SUPPORT_TYPES, STATUSES, STATUS_LABEL,
        error: null, activeModule: 'business', adminName: req.session.adminName,
    });
});
router.post('/:id/edit', requireRole('admin'), (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'business') return res.status(404).render('404');
    const data = Object.assign({}, sub.data, collect(req.body));
    const ns = nameSub(data);
    db.updateSubmissionData(sub.id, data);
    db.setSubmissionDisplay(sub.id, ns.display_name, ns.display_subtitle);
    req.session.bizNotice = 'Business partner updated.';
    res.redirect('/business/' + sub.id);
});

// ---- Quick status change ----
router.post('/:id/status', requireRole('admin'), (req, res) => {
    if (STATUSES.includes(req.body.status)) db.updateSubmissionData(req.params.id, { status: req.body.status });
    res.redirect('/business/' + req.params.id);
});

// ---- Add documents to an existing partner ----
router.post('/:id/files', requireRole('admin'), upload.array('documents', 10), (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'business') return res.status(404).render('404');
    if (req.files && req.files.length) db.insertFiles(sub.id, req.files);
    req.session.bizNotice = 'Documents uploaded.';
    res.redirect('/business/' + sub.id);
});

// ---- Detail ----
router.get('/:id', requireModule('business'), (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'business') return res.status(404).render('404');
    res.render('business/detail', {
        sub, groups: FIELDS, files: db.getFilesBySubmission(sub.id),
        status: statusOf(sub), STATUSES, STATUS_LABEL,
        canManage: req.session.role === 'admin',
        activeModule: 'business', adminName: req.session.adminName,
        notice: (function () { const n = req.session.bizNotice; req.session.bizNotice = null; return n || null; })(),
    });
});

// ---- File download ----
router.get('/files/:fid', requireModule('business'), (req, res) => {
    const file = db.getFileById(req.params.fid);
    if (!file) return res.status(404).send('File not found');
    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).send('File missing on disk');
    res.setHeader('Content-Disposition', `inline; filename="${file.original_name.replace(/"/g, '')}"`);
    res.sendFile(filePath);
});

router.use((err, req, res, next) => { if (err) return res.status(400).send('Error: ' + err.message); next(); });

module.exports = { router, FIELDS, STATUSES, SUPPORT_TYPES, nameSub };

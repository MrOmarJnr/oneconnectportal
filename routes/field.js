const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('../src/db');
const fc = require('../src/fieldcase');
const { requireModule, requireRole } = require('../src/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = crypto.randomBytes(8).toString('hex');
        cb(null, `${Date.now()}-${unique}${path.extname(file.originalname)}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024, files: 20 }, // 50MB/file, 20 files (large media -> Vercel Blob later)
});

// Everyone with field-module access can see the list; field users see only their own
router.get('/', requireModule('field'), (req, res) => {
    const role = req.session.role;
    let rows = db.listSubmissions({ type: 'field_case' });
    if (role === 'field') {
        rows = rows.filter((r) => r.data && r.data._created_by_id === req.session.adminId);
    }
    const fileCountMap = db.getFileCountsMap();
    res.render('field/list', {
        rows,
        fileCountMap,
        canCreate: role === 'admin' || role === 'field',
        adminName: req.session.adminName,
        activeModule: 'field',
        notice: (function () { const n = req.session.fieldNotice; req.session.fieldNotice = null; return n || null; })(),
    });
});

// New-case form — only creators (admin, field)
router.get('/new', requireRole('admin', 'field'), (req, res) => {
    res.render('field/new', {
        fc,
        prefillPartner: req.session.adminName || '',
        error: null,
        activeModule: 'field',
        adminName: req.session.adminName,
    });
});

// Create a case
router.post('/new', requireRole('admin', 'field'), upload.array('documents', 20), (req, res) => {
    try {
        const body = req.body;
        const data = {};

        // scalar fields
        [...fc.VISIT_FIELDS, ...fc.FIELD_NOTES, ...fc.DIST_LOG, ...fc.IMPACT].forEach((f) => {
            data[f.key] = (body[f.key] || '').toString().trim();
        });
        // program types (multi) + checkbox groups (multi)
        data.program_type = fc.toArray(body.program_type);
        data.program_other = (body.program_other || '').toString().trim();
        fc.CHECK_GROUP_NAMES.forEach((name) => { data[name] = fc.toArray(body[name]); });

        // ownership + audit
        data._created_by_id = req.session.adminId;
        data._created_by_name = req.session.adminName;

        if (!data.location_name) {
            return res.status(400).render('field/new', {
                fc, prefillPartner: data.field_partner || '', activeModule: 'field',
                adminName: req.session.adminName,
                error: 'Please enter the name of the school or community before submitting.',
            });
        }

        const id = db.insertSubmission({
            type: 'field_case',
            display_name: fc.displayNameFor(data),
            display_subtitle: fc.displaySubtitleFor(data),
            data,
        });
        if (req.files && req.files.length) db.insertFiles(id, req.files);

        req.session.fieldNotice = `Field case for "${fc.displayNameFor(data)}" submitted.`;
        res.redirect('/field');
    } catch (err) {
        console.error(err);
        res.status(400).render('field/new', {
            fc, prefillPartner: req.session.adminName || '', activeModule: 'field',
            adminName: req.session.adminName,
            error: 'Something went wrong saving the case: ' + err.message,
        });
    }
});

// Case detail — viewable by anyone with field access; field users only their own
router.get('/cases/:id', requireModule('field'), (req, res) => {
    const c = db.getSubmissionById(req.params.id);
    if (!c || c.type !== 'field_case') return res.status(404).render('404');
    if (req.session.role === 'field' && c.data._created_by_id !== req.session.adminId) {
        return res.status(403).render('403', { adminName: req.session.adminName });
    }
    if (req.session.role !== 'viewer') db.markReviewedIfNew(c.id);
    const files = db.getFilesBySubmission(c.id);
    res.render('field/detail', {
        c, files, fc, activeModule: 'field', adminName: req.session.adminName,
        canReview: req.session.role === 'admin',
    });
});

// Admin/viewer can change status
router.post('/cases/:id/status', requireRole('admin'), (req, res) => {
    if (fc.STATUSES.includes(req.body.status)) db.updateSubmissionStatus(req.params.id, req.body.status);
    res.redirect('/field/cases/' + req.params.id);
});

// Protected file download for field-module users
router.get('/files/:id', requireModule('field'), (req, res) => {
    const file = db.getFileById(req.params.id);
    if (!file) return res.status(404).send('File not found');
    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).send('File missing on disk');
    res.setHeader('Content-Disposition', `inline; filename="${file.original_name.replace(/"/g, '')}"`);
    res.sendFile(filePath);
});

// Friendly multer errors
router.use((err, req, res, next) => {
    if (err) return res.status(400).send('Upload error: ' + err.message);
    next();
});

module.exports = router;

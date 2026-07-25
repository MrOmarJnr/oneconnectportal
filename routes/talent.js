const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('../src/db');
const t = require('../src/talent');
const fmt = require('../src/format');
const { requireModule } = require('../src/auth');

const router = express.Router();
router.use(requireModule('talent')); // admin-only

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024, files: 12 } });

function stageOf(row) { return t.VOLUNTEER_STAGES.includes(row.data && row.data.stage) ? row.data.stage : 'applied'; }

// ============ VOLUNTEERS ============
router.get('/', (req, res) => res.redirect('/talent/volunteers'));

router.get('/volunteers', (req, res) => {
    const vols = db.listSubmissions({ type: 'opportunity' });
    const board = {};
    t.VOLUNTEER_STAGES.forEach((s) => { board[s] = []; });
    vols.forEach((v) => { board[stageOf(v)].push(v); });
    res.render('talent/volunteers', {
        board, stages: t.VOLUNTEER_STAGES, STAGE_LABEL: t.STAGE_LABEL, stageOf,
        total: vols.length, activeModule: 'talent', talentTab: 'volunteers', adminName: req.session.adminName,
        notice: (function () { const n = req.session.tNotice; req.session.tNotice = null; return n || null; })(),
    });
});

router.get('/volunteers/new', (req, res) => {
    let data = {}, draftId = '';
    if (req.query.draft) { const dr = db.getDraft(req.query.draft); if (dr && dr.owner_id === req.session.adminId && dr.module === 'volunteer') { data = dr.data || {}; draftId = dr.id; } }
    res.render('talent/volunteer_new', { error: null, data, draftId, activeModule: 'talent', talentTab: 'volunteers', adminName: req.session.adminName });
});
router.post('/volunteers/new', (req, res) => {
    const data = {
        full_name: (req.body.full_name || '').trim(),
        email: (req.body.email || '').trim(),
        phone: (req.body.phone || '').trim(),
        opportunity: (req.body.opportunity || '').trim(),
        location: (req.body.location || '').trim(),
        stage: 'applied', stage_notes: [], source: 'manual',
    };
    if (!data.full_name) {
        return res.status(400).render('talent/volunteer_new', { error: 'Name is required.', activeModule: 'talent', talentTab: 'volunteers', adminName: req.session.adminName });
    }
    const id = db.insertSubmission({
        type: 'opportunity',
        display_name: data.full_name,
        display_subtitle: [data.opportunity, data.location].filter(Boolean).join(' • ') || 'Volunteer',
        data,
    });
    req.session.tNotice = 'Volunteer added.';
    res.redirect('/talent/volunteers/' + id);
});

router.get('/volunteers/:id', (req, res) => {
    const v = db.getSubmissionById(req.params.id);
    if (!v || v.type !== 'opportunity') return res.status(404).render('404');
    res.render('talent/volunteer_detail', {
        v, stage: stageOf(v), stages: t.VOLUNTEER_STAGES, STAGE_LABEL: t.STAGE_LABEL,
        notes: Array.isArray(v.data.stage_notes) ? v.data.stage_notes : [],
        files: db.getFilesBySubmission(v.id),
        activeModule: 'talent', talentTab: 'volunteers', adminName: req.session.adminName,
    });
});
router.post('/volunteers/:id/stage', (req, res) => {
    if (t.VOLUNTEER_STAGES.includes(req.body.stage)) db.updateSubmissionData(req.params.id, { stage: req.body.stage });
    res.redirect('/talent/volunteers/' + req.params.id);
});
router.post('/volunteers/:id/note', (req, res) => {
    const v = db.getSubmissionById(req.params.id);
    if (v && (req.body.note || '').trim()) {
        const notes = Array.isArray(v.data.stage_notes) ? v.data.stage_notes.slice() : [];
        notes.push({ text: req.body.note.trim(), stage: stageOf(v), at: new Date().toISOString(), by: req.session.adminName });
        db.updateSubmissionData(v.id, { stage_notes: notes });
    }
    res.redirect('/talent/volunteers/' + req.params.id);
});

// ============ APPLICATIONS (website volunteer applications, type 'opportunity') ============
router.get('/applications', (req, res) => {
    const q = (req.query.q || '').trim();
    const rows = db.listSubmissions({ type: 'opportunity', q });
    res.render('talent/applications', {
        rows, q, fileCountMap: db.getFileCountsMap(), stageOf, STAGE_LABEL: t.STAGE_LABEL,
        activeModule: 'talent', talentTab: 'applications', adminName: req.session.adminName,
    });
});

router.get('/applications/:id', (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'opportunity') return res.status(404).render('404');
    res.render('talent/application_detail', {
        sub,
        sections: fmt.buildSections('opportunity', sub.data),
        consent: fmt.buildConsent('opportunity', sub.data),
        files: db.getFilesBySubmission(sub.id),
        stage: stageOf(sub), STAGE_LABEL: t.STAGE_LABEL,
        activeModule: 'talent', talentTab: 'applications', adminName: req.session.adminName,
    });
});

// ============ STAFFING ============
function collectStaff(body) {
    const data = {};
    t.STAFF_KEYS.forEach((k) => { data[k] = (body[k] || '').toString().trim(); });
    return data;
}

router.get('/staff', (req, res) => {
    const q = (req.query.q || '').trim();
    let rows = db.listSubmissions({ type: 'staff', q });
    const typeFilter = req.query.ptype || 'all';
    if (typeFilter !== 'all') rows = rows.filter((r) => (r.data.person_type || '') === typeFilter);
    res.render('talent/staff_list', {
        rows, typeFilter, q, PERSON_TYPES: t.PERSON_TYPES, fileCountMap: db.getFileCountsMap(),
        activeModule: 'talent', talentTab: 'staff', adminName: req.session.adminName,
        notice: (function () { const n = req.session.tNotice; req.session.tNotice = null; return n || null; })(),
    });
});

router.get('/staff/new', (req, res) => {
    let data = {}, draftId = '';
    if (req.query.draft) { const dr = db.getDraft(req.query.draft); if (dr && dr.owner_id === req.session.adminId && dr.module === 'staff') { data = dr.data || {}; draftId = dr.id; } }
    res.render('talent/staff_form', { mode: 'new', id: '', groups: t.STAFF_GROUPS, data, draftId, error: null, activeModule: 'talent', talentTab: 'staff', adminName: req.session.adminName });
});
router.post('/staff/new', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'documents', maxCount: 10 }]), (req, res) => {
    const data = collectStaff(req.body);
    data._created_by_name = req.session.adminName;
    if (!data.full_name) {
        return res.status(400).render('talent/staff_form', { mode: 'new', groups: t.STAFF_GROUPS, data, error: 'Full name is required.', activeModule: 'talent', talentTab: 'staff', adminName: req.session.adminName });
    }
    const id = db.insertSubmission({ type: 'staff', display_name: t.staffName(data), display_subtitle: t.staffSub(data), data });
    const files = [].concat(req.files && req.files.photo ? req.files.photo : [], req.files && req.files.documents ? req.files.documents : []);
    if (files.length) db.insertFiles(id, files);
    req.session.tNotice = 'Staff profile created.';
    res.redirect('/talent/staff/' + id);
});

router.get('/staff/:id/edit', (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'staff') return res.status(404).render('404');
    res.render('talent/staff_form', { mode: 'edit', id: sub.id, groups: t.STAFF_GROUPS, data: sub.data, error: null, activeModule: 'talent', talentTab: 'staff', adminName: req.session.adminName });
});
router.post('/staff/:id/edit', (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'staff') return res.status(404).render('404');
    const data = Object.assign({}, sub.data, collectStaff(req.body));
    db.updateSubmissionData(sub.id, data);
    db.setSubmissionDisplay(sub.id, t.staffName(data), t.staffSub(data));
    req.session.tNotice = 'Staff profile updated.';
    res.redirect('/talent/staff/' + sub.id);
});
router.post('/staff/:id/files', upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'documents', maxCount: 10 }]), (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'staff') return res.status(404).render('404');
    const files = [].concat(req.files && req.files.photo ? req.files.photo : [], req.files && req.files.documents ? req.files.documents : []);
    if (files.length) db.insertFiles(sub.id, files);
    req.session.tNotice = 'Files uploaded.';
    res.redirect('/talent/staff/' + sub.id);
});

router.get('/staff/:id', (req, res) => {
    const sub = db.getSubmissionById(req.params.id);
    if (!sub || sub.type !== 'staff') return res.status(404).render('404');
    const files = db.getFilesBySubmission(sub.id);
    const photo = files.find((f) => f.field_name === 'photo' || /^image\//.test(f.mime_type || ''));
    res.render('talent/staff_detail', {
        sub, groups: t.STAFF_GROUPS, files, photo,
        activeModule: 'talent', talentTab: 'staff', adminName: req.session.adminName,
        notice: (function () { const n = req.session.tNotice; req.session.tNotice = null; return n || null; })(),
    });
});

// Shared file download for talent (volunteers CVs + staff docs/photos)
router.get('/files/:fid', (req, res) => {
    const file = db.getFileById(req.params.fid);
    if (!file) return res.status(404).send('File not found');
    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).send('File missing on disk');
    res.setHeader('Content-Disposition', `inline; filename="${file.original_name.replace(/"/g, '')}"`);
    res.sendFile(filePath);
});

router.use((err, req, res, next) => { if (err) return res.status(400).send('Error: ' + err.message); next(); });

module.exports = router;

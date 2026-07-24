const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../src/db');
const { requireLogin, requireModule } = require('../src/auth');
const { buildSections, buildConsent } = require('../src/format');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

router.use(requireLogin);
router.use(requireModule('support'));

router.get('/', (req, res) => {
    const typeFilter = ['opportunity', 'support'].includes(req.query.type) ? req.query.type : 'all';
    const statusFilter = ['new', 'reviewed', 'archived'].includes(req.query.status) ? req.query.status : 'all';
    const q = (req.query.q || '').trim();

    const rows = db.listSubmissions({ type: typeFilter, status: statusFilter, q });
    const fileCountMap = db.getFileCountsMap();
    const counts = db.getCounts();

    res.render('dashboard', {
        rows,
        fileCountMap,
        counts,
        typeFilter,
        statusFilter,
        q,
        adminName: req.session.adminName,
        activeModule: 'support',
    });
});

router.get('/submissions/:id', (req, res) => {
    const submission = db.getSubmissionById(req.params.id);
    if (!submission) return res.status(404).render('404');

    const data = submission.data;
    const files = db.getFilesBySubmission(submission.id);
    const sections = buildSections(submission.type, data);
    const consent = buildConsent(submission.type, data);

    // Auto-mark as reviewed the first time an admin opens it
    if (submission.status === 'new') {
        db.markReviewedIfNew(submission.id);
        submission.status = 'reviewed';
    }

    res.render('detail', {
        submission,
        sections,
        consent,
        files,
        adminName: req.session.adminName,
        activeModule: 'support',
    });
});

router.post('/submissions/:id/status', (req, res) => {
    const { status } = req.body;
    if (!['new', 'reviewed', 'archived'].includes(status)) {
        return res.status(400).send('Invalid status');
    }
    db.updateSubmissionStatus(req.params.id, status);
    res.redirect('back');
});

// Protected file download — only logged-in admins can fetch uploaded documents/CVs
router.get('/files/:fileId', (req, res) => {
    const file = db.getFileById(req.params.fileId);
    if (!file) return res.status(404).send('File not found');

    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).send('File missing on disk');

    res.setHeader('Content-Disposition', `inline; filename="${file.original_name.replace(/"/g, '')}"`);
    res.sendFile(filePath);
});

module.exports = router;

const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('../src/db');
const { displayNameFor, displaySubtitleFor } = require('../src/format');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${unique}${ext}`);
    },
});

const ALLOWED_MIME = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/jpg',
]);

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB per file, matches form copy
    fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
        cb(new Error('Unsupported file type: ' + file.originalname));
    },
});

function saveSubmission(type, req) {
    const data = { ...req.body };
    if (type === 'support') {
        data.source = 'website';
        data.work_status = 'new';
    }

    const submissionId = db.insertSubmission({
        type,
        display_name: displayNameFor(type, data),
        display_subtitle: displaySubtitleFor(type, data),
        data,
    });

    const files = req.files || [];
    if (files.length) {
        db.insertFiles(submissionId, files);
    }

    return submissionId;
}

// From apply.html — single CV file under field name "cv"
router.post('/submit/opportunity', upload.single('cv'), (req, res) => {
    try {
        const files = req.file ? [req.file] : [];
        req.files = files;
        const id = saveSubmission('opportunity', req);
        res.json({ ok: true, id });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err.message });
    }
});

// From request-support.html — multiple documents under field name "documents[]" / "documents"
router.post('/submit/support', upload.array('documents', 10), (req, res) => {
    try {
        const id = saveSubmission('support', req);
        res.json({ ok: true, id });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err.message });
    }
});

// From the website partnership form — routed to Business Partners as "Prospective"
router.post('/submit/partner', upload.array('documents', 10), (req, res) => {
    try {
        // The website partnership form uses friendly labels ("Full Name", "Email",
        // "Organization Name", ...). The Business module reads specific snake_case
        // keys (partner_name, contact_name, contact_email, ...), so map them here —
        // otherwise every field renders blank in the portal.
        const b = req.body || {};
        const pick = (...keys) => {
            for (const k of keys) {
                const v = b[k];
                if (Array.isArray(v)) { if (v.length) return v.join(', '); }
                else if (v != null && String(v).trim() !== '') return String(v).trim();
            }
            return '';
        };

        const notesParts = [];
        const addr = pick('Organization Address', 'organization_address');
        if (addr) notesParts.push('Organization Address: ' + addr);
        const programs = pick('Programs', 'programs');
        if (programs) notesParts.push('Programs of Interest: ' + programs);
        const opportunity = pick('Partnership Opportunity', 'partnership_opportunity');
        if (opportunity) notesParts.push('Partnership Opportunity: ' + opportunity);
        const timeline = pick('Timeline', 'timeline');
        if (timeline) notesParts.push('Timeline: ' + timeline);
        const extra = pick('Additional Information', 'additional_information', 'message');
        if (extra) notesParts.push('\n' + extra);

        const data = {
            source: 'website',
            status: 'prospective',
            partner_name: pick('Organization Name', 'organization_name', 'partner_name', 'company'),
            industry: pick('Industry', 'industry'),
            country: pick('Countries', 'Other Country', 'country'),
            website: pick('Website', 'website'),
            contact_name: pick('Full Name', 'full_name', 'contact_name', 'name'),
            contact_title: pick('Title', 'contact_title'),
            contact_email: pick('Email', 'email', 'contact_email'),
            contact_phone: pick('Phone Number', 'phone', 'contact_phone'),
            notes: notesParts.join('\n'),
            support_type: [],
        };
        const name = data.partner_name || data.contact_name || 'Unnamed Partner';
        const id = db.insertSubmission({
            type: 'business',
            display_name: name,
            display_subtitle: [data.country].filter(Boolean).join(' • ') || 'Business Partner',
            data,
        });
        if (req.files && req.files.length) db.insertFiles(id, req.files);
        res.json({ ok: true, id });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err.message });
    }
});

// Friendly error handling for multer errors (file too large, bad type, etc.)
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err) {
        return res.status(400).json({ ok: false, error: err.message });
    }
    next();
});

module.exports = router;

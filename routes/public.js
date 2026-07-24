const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
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

// ---------------------------------------------------------------------------
// Branded email (Resend) — sends a confirmation to the submitter and an alert
// to the admin. Reads RESEND_API_KEY / MAIL_FROM / ADMIN_EMAIL from the portal
// .env. Uses the built-in https module, so no extra npm packages are needed.
// ---------------------------------------------------------------------------
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (m) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
    ));
}
function firstOf(data, keys) {
    for (const k of keys) {
        if (data[k] != null && String(data[k]).trim() !== '') return String(data[k]).trim();
    }
    return '';
}
const EMAIL_LABELS = {
    opportunity: ['Volunteer Application', 'volunteer application'],
    support:     ['Support Request', 'community support request'],
    partner:     ['Partnership Inquiry', 'partnership inquiry'],
    contact:     ['Contact Message', 'message'],
};
function emailShell(bodyHtml) {
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        + '<body style="margin:0;padding:0;background:#f4f2ee;">'
        + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:24px 12px;">'
        + '<tr><td align="center">'
        + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:Arial,Helvetica,sans-serif;">'
        + '<tr><td style="background:#2D4A3E;padding:26px 30px;text-align:center;border-radius:14px 14px 0 0;">'
        + '<div style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:.3px;">United in One <span style="color:#D4933A;">Global Foundation</span></div>'
        + '</td></tr>'
        + '<tr><td style="height:4px;background:#D4933A;font-size:0;line-height:0;">&nbsp;</td></tr>'
        + '<tr><td style="background:#ffffff;padding:34px 32px 26px;">' + bodyHtml + '</td></tr>'
        + '<tr><td style="background:#ffffff;border-radius:0 0 14px 14px;border-top:1px solid #f0ede7;padding:18px 32px 26px;text-align:center;color:#9a9a9a;font-size:12px;line-height:1.7;">'
        + 'United in One Global Foundation &middot; 501(c)(3) nonprofit<br>'
        + '<a href="https://unitedinone.org" style="color:#9a9a9a;">unitedinone.org</a></td></tr>'
        + '</table></td></tr></table></body></html>';
}
function confirmationBody(name, noun) {
    return '<div style="text-align:center;margin:0 0 6px;">'
        + '<span style="display:inline-block;width:56px;height:56px;line-height:56px;border-radius:50%;background:#eef4f0;color:#2D4A3E;font-size:28px;font-weight:bold;">&#10003;</span></div>'
        + '<h1 style="color:#2D4A3E;font-size:23px;margin:14px 0 10px;text-align:center;">Thank you, ' + esc(name) + '!</h1>'
        + '<p style="color:#555;font-size:15px;line-height:1.7;margin:0 0 18px;text-align:center;">Your <strong>' + esc(noun) + '</strong> has been received. Our team will review it and get back to you soon &mdash; you don&rsquo;t need to do anything else right now.</p>'
        + '<div style="background:#eef4f0;border-left:4px solid #D4933A;padding:13px 18px;border-radius:8px;color:#2D4A3E;font-size:14px;margin:0 0 24px;">We typically respond within <strong>two business days</strong>.</div>'
        + '<div style="text-align:center;margin:0 0 6px;"><a href="https://unitedinone.org" style="display:inline-block;background:#D4933A;color:#182E25;font-weight:bold;text-decoration:none;padding:12px 28px;border-radius:30px;font-size:14px;">Visit our website</a></div>'
        + '<p style="color:#9a9a9a;font-size:13px;margin:24px 0 0;text-align:center;">With gratitude,<br>The United in One team</p>';
}
function adminBody(label, data, files) {
    let rows = '';
    for (const [k, v] of Object.entries(data)) {
        if (!k || k[0] === '_') continue;
        const val = Array.isArray(v) ? v.join(', ') : v;
        if (val == null || String(val).trim() === '') continue;
        const niceKey = k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        rows += '<tr>'
            + '<td style="padding:9px 14px;border:1px solid #eee;background:#f7f5f0;color:#2D4A3E;font-weight:bold;vertical-align:top;white-space:nowrap;">' + esc(niceKey) + '</td>'
            + '<td style="padding:9px 14px;border:1px solid #eee;color:#1b1b1b;">' + esc(String(val)).replace(/\n/g, '<br>') + '</td>'
            + '</tr>';
    }
    const note = (files && files.length)
        ? files.length + ' file(s): ' + esc(files.map((f) => f.originalname).join(', '))
        : 'No files attached.';
    return '<h2 style="color:#2D4A3E;font-size:21px;margin:0 0 4px;">New ' + esc(label) + '</h2>'
        + '<p style="color:#9a9a9a;font-size:13px;margin:0 0 20px;">Received ' + esc(new Date().toLocaleString()) + '</p>'
        + '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">' + rows + '</table>'
        + '<p style="color:#9a9a9a;font-size:13px;margin-top:16px;">' + note + '</p>';
}
function resendSend(to, subject, html, replyTo) {
    return new Promise((resolve) => {
        const key = process.env.RESEND_API_KEY;
        if (!key) return resolve({ ok: false, skip: true });
        const payload = JSON.stringify({
            from: process.env.MAIL_FROM || 'United in One Global Foundation <noreply@noreply.allrounditsol.com>',
            to: Array.isArray(to) ? to : [to],
            subject,
            html,
            ...(replyTo ? { reply_to: replyTo } : {}),
        });
        const req = https.request('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + key,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (r) => {
            let body = '';
            r.on('data', (c) => { body += c; });
            r.on('end', () => resolve({ ok: r.statusCode >= 200 && r.statusCode < 300, code: r.statusCode, body }));
        });
        req.on('error', (e) => resolve({ ok: false, error: e.message }));
        req.write(payload);
        req.end();
    });
}
async function sendEmails(type, data, files) {
    try {
        const [label, noun] = EMAIL_LABELS[type] || ['Website Submission', 'submission'];
        const senderEmail = firstOf(data, ['email', 'contact_email', 'Email', 'Email Address']);
        const senderName = firstOf(data, ['full_name', 'first_name', 'contact_name', 'name', 'organization_name', 'partner_name', 'Full Name']) || 'there';
        if (senderEmail && /.+@.+\..+/.test(senderEmail)) {
            const r = await resendSend(senderEmail, 'We have received your ' + noun + ' - United in One Global Foundation', emailShell(confirmationBody(senderName, noun)));
            if (!r.ok && !r.skip) console.error('[mail] confirmation failed', r.code || r.error, r.body || '');
        }
        const adminList = (process.env.ADMIN_EMAIL || '').split(/[;,]+/).map((s) => s.trim()).filter(Boolean);
        if (adminList.length) {
            const r = await resendSend(adminList, 'New ' + label + ' submitted', emailShell(adminBody(label, data, files || [])), senderEmail || undefined);
            if (!r.ok && !r.skip) console.error('[mail] admin failed', r.code || r.error, r.body || '');
        }
    } catch (e) {
        console.error('[mail] error', e.message);
    }
}

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
        sendEmails('opportunity', req.body, files);
        res.json({ ok: true, id });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err.message });
    }
});
// From request-support.html — multiple documents under field name "documents"
router.post('/submit/support', upload.array('documents', 10), (req, res) => {
    try {
        const id = saveSubmission('support', req);
        sendEmails('support', req.body, req.files || []);
        res.json({ ok: true, id });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err.message });
    }
});
// From the website partnership form — routed to Business Partners as "Prospective"
router.post('/submit/partner', upload.array('documents', 10), (req, res) => {
    try {
        const data = { ...req.body };
        data.source = 'website';
        if (!['prospective', 'active', 'inactive'].includes(data.status)) data.status = 'prospective';
        if (data.support_type && !Array.isArray(data.support_type)) data.support_type = [data.support_type];
        const name = (data.partner_name || data.company || data.contact_name || 'Unnamed Partner').toString();
        const id = db.insertSubmission({
            type: 'business',
            display_name: name,
            display_subtitle: [data.country].filter(Boolean).join(' • ') || 'Business Partner',
            data,
        });
        if (req.files && req.files.length) db.insertFiles(id, req.files);
        sendEmails('partner', data, req.files || []);
        res.json({ ok: true, id });
    } catch (err) {
        console.error(err);
        res.status(400).json({ ok: false, error: err.message });
    }
});
// From contact-us.html — no portal module, so just email (no stored record)
router.post('/submit/contact', upload.none(), (req, res) => {
    try {
        sendEmails('contact', req.body, []);
        res.json({ ok: true });
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

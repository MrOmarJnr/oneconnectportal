// Pure-JS JSON-file datastore — no native compilation required (unlike better-sqlite3),
// so `npm install` works on any machine without build tools / Visual Studio / Xcode.
// Fine for a nonprofit's volume of submissions. Writes are synchronous + atomic
// (write to temp file, then rename) to avoid corrupting the file mid-write.

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ROLES = ['admin', 'field', 'viewer'];

function defaultState() {
    return {
        admins: [],
        submissions: [],
        files: [],
        partners: [],
        drafts: [],
        seq: { admins: 0, submissions: 0, files: 0, partners: 0, drafts: 0 },
    };
}

function load() {
    if (!fs.existsSync(DB_FILE)) {
        const initial = defaultState();
        save(initial);
        return initial;
    }
    try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('Failed to read/parse data/db.json — starting from an empty database.', err);
        const initial = defaultState();
        save(initial);
        return initial;
    }
}

function save(state) {
    const tmpFile = DB_FILE + '.tmp';
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmpFile, DB_FILE);
}

function nextId(state, table) {
    state.seq[table] = (state.seq[table] || 0) + 1;
    return state.seq[table];
}

// ---------- Users (stored in the "admins" table for backward compatibility) ----------
// Every account has a role: 'admin' (full access), 'field' (Create a Field Case only),
// or 'viewer' (read everything except Talent Management). Legacy rows with no role
// are treated as 'admin' so existing accounts keep working.

function normalizeUser(a) {
    if (!a) return a;
    return {
        ...a,
        role: ROLES.includes(a.role) ? a.role : 'admin',
        status: a.status === 'inactive' ? 'inactive' : 'active',
    };
}

function getAdminByEmail(email) {
    const state = load();
    const found = state.admins.find((a) => a.email === email.trim().toLowerCase());
    return found ? normalizeUser(found) : null;
}

function getAdminById(id) {
    const state = load();
    const found = state.admins.find((a) => a.id === Number(id));
    return found ? normalizeUser(found) : null;
}

function listAdmins() {
    return load().admins
        .map(normalizeUser)
        .sort((a, b) => a.id - b.id);
}

function countAdmins() {
    return load().admins.length;
}

function insertAdmin({ name, email, password_hash, role = 'admin', status = 'active', photo = '' }) {
    const state = load();
    const admin = {
        id: nextId(state, 'admins'),
        name,
        email: email.trim().toLowerCase(),
        password_hash,
        role: ROLES.includes(role) ? role : 'admin',
        status: status === 'inactive' ? 'inactive' : 'active',
        photo: photo || '',
        created_at: new Date().toISOString(),
    };
    state.admins.push(admin);
    save(state);
    return normalizeUser(admin);
}

function upsertAdminPassword({ name, email, password_hash, role }) {
    const state = load();
    const normalizedEmail = email.trim().toLowerCase();
    const existing = state.admins.find((a) => a.email === normalizedEmail);
    if (existing) {
        existing.name = name;
        existing.password_hash = password_hash;
        if (role && ROLES.includes(role)) existing.role = role;
        save(state);
        return { created: false, admin: normalizeUser(existing) };
    }
    const admin = {
        id: nextId(state, 'admins'),
        name,
        email: normalizedEmail,
        password_hash,
        role: ROLES.includes(role) ? role : 'admin',
        status: 'active',
        created_at: new Date().toISOString(),
    };
    state.admins.push(admin);
    save(state);
    return { created: true, admin: normalizeUser(admin) };
}

function updateAdminPassword(id, password_hash) {
    const state = load();
    const user = state.admins.find((a) => a.id === Number(id));
    if (user) { user.password_hash = password_hash; save(state); }
    return user ? normalizeUser(user) : null;
}

function updateAdmin(id, { name, role, status }) {
    const state = load();
    const user = state.admins.find((a) => a.id === Number(id));
    if (!user) return null;
    if (typeof name === 'string' && name.trim()) user.name = name.trim();
    if (role && ROLES.includes(role)) user.role = role;
    if (status === 'active' || status === 'inactive') user.status = status;
    save(state);
    return normalizeUser(user);
}

function updateAdminPhoto(id, photo) {
    const state = load();
    const u = state.admins.find((a) => a.id === Number(id));
    if (u) { u.photo = photo || ''; save(state); }
    return u ? normalizeUser(u) : null;
}

function setResetToken(id, token, expiresISO) {
    const state = load();
    const u = state.admins.find((a) => a.id === Number(id));
    if (u) { u.reset_token = token; u.reset_expires = expiresISO; save(state); }
    return u ? normalizeUser(u) : null;
}

function getAdminByResetToken(token) {
    if (!token) return null;
    const state = load();
    const u = state.admins.find((a) => a.reset_token === token);
    if (!u) return null;
    if (!u.reset_expires || new Date(u.reset_expires).getTime() < Date.now()) return null;
    return normalizeUser(u);
}

function clearResetToken(id) {
    const state = load();
    const u = state.admins.find((a) => a.id === Number(id));
    if (u) { delete u.reset_token; delete u.reset_expires; save(state); }
    return u ? normalizeUser(u) : null;
}

// ---------- Submissions ----------

function insertSubmission({ type, display_name, display_subtitle, data }) {
    const state = load();
    const submission = {
        id: nextId(state, 'submissions'),
        type,
        status: 'new',
        display_name,
        display_subtitle,
        data,
        created_at: new Date().toISOString(),
    };
    state.submissions.push(submission);
    save(state);
    return submission.id;
}

function insertFiles(submissionId, files) {
    if (!files || !files.length) return;
    const state = load();
    files.forEach((f) => {
        state.files.push({
            id: nextId(state, 'files'),
            submission_id: submissionId,
            field_name: f.fieldname,
            original_name: f.originalname,
            stored_name: f.filename,
            size: f.size,
            mime_type: f.mimetype,
            created_at: new Date().toISOString(),
        });
    });
    save(state);
}

function listSubmissions({ type, status, q } = {}) {
    const state = load();
    let rows = state.submissions;

    if (type && type !== 'all') rows = rows.filter((r) => r.type === type);
    if (status && status !== 'all') rows = rows.filter((r) => r.status === status);
    if (q) {
        const needle = q.toLowerCase();
        rows = rows.filter((r) =>
            (r.display_name || '').toLowerCase().includes(needle) ||
            (r.display_subtitle || '').toLowerCase().includes(needle)
        );
    }

    return rows.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function getSubmissionById(id) {
    const state = load();
    return state.submissions.find((s) => s.id === Number(id)) || null;
}

function updateSubmissionStatus(id, status) {
    const state = load();
    const submission = state.submissions.find((s) => s.id === Number(id));
    if (submission) {
        submission.status = status;
        save(state);
    }
    return submission || null;
}

function markReviewedIfNew(id) {
    const state = load();
    const submission = state.submissions.find((s) => s.id === Number(id));
    if (submission && submission.status === 'new') {
        submission.status = 'reviewed';
        save(state);
    }
    return submission || null;
}

function getCounts() {
    const state = load();
    return {
        all: state.submissions.length,
        opportunity: state.submissions.filter((s) => s.type === 'opportunity').length,
        support: state.submissions.filter((s) => s.type === 'support').length,
        new: state.submissions.filter((s) => s.status === 'new').length,
    };
}

// ---------- Files ----------

function getFilesBySubmission(submissionId) {
    const state = load();
    return state.files
        .filter((f) => f.submission_id === Number(submissionId))
        .sort((a, b) => a.id - b.id);
}

function getFileById(fileId) {
    const state = load();
    return state.files.find((f) => f.id === Number(fileId)) || null;
}

function getFileCountsMap() {
    const state = load();
    const map = {};
    state.files.forEach((f) => {
        map[f.submission_id] = (map[f.submission_id] || 0) + 1;
    });
    return map;
}


// ---------- Field Partners (assignable to support requests) ----------

function listFieldPartners({ activeOnly = false } = {}) {
    const state = load();
    let rows = state.partners || [];
    if (activeOnly) rows = rows.filter((p) => p.active !== false);
    return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function addFieldPartner(name) {
    const state = load();
    if (!state.partners) state.partners = [];
    const nm = (name || '').trim();
    if (!nm) return null;
    if (state.partners.some((p) => p.name.toLowerCase() === nm.toLowerCase())) return null;
    const p = { id: nextId(state, 'partners'), name: nm, active: true, created_at: new Date().toISOString() };
    state.partners.push(p);
    save(state);
    return p;
}

function updateFieldPartner(id, { name, active } = {}) {
    const state = load();
    const p = (state.partners || []).find((x) => x.id === Number(id));
    if (!p) return null;
    if (typeof name === 'string' && name.trim()) p.name = name.trim();
    if (typeof active === 'boolean') p.active = active;
    save(state);
    return p;
}

function removeFieldPartner(id) {
    const state = load();
    if (!state.partners) return false;
    const before = state.partners.length;
    state.partners = state.partners.filter((x) => x.id !== Number(id));
    save(state);
    return state.partners.length < before;
}

// ---------- Support-request helpers ----------
// Website + manual "support" submissions carry data.work_status (new|in_progress|closed),
// data.assigned_to (field-partner name) and data.source (website|manual).

function updateSubmissionData(id, patch) {
    const state = load();
    const sub = state.submissions.find((s) => s.id === Number(id));
    if (!sub) return null;
    sub.data = Object.assign({}, sub.data, patch);
    save(state);
    return sub;
}

function setSubmissionDisplay(id, display_name, display_subtitle) {
    const state = load();
    const sub = state.submissions.find((s) => s.id === Number(id));
    if (sub) {
        if (display_name) sub.display_name = display_name;
        if (display_subtitle) sub.display_subtitle = display_subtitle;
        save(state);
    }
    return sub || null;
}

// ---------- Drafts (private per-user, resumable form saves) ----------

function listDraftsByOwner(ownerId) {
    const state = load();
    return (state.drafts || [])
        .filter((x) => x.owner_id === Number(ownerId))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
}

function getDraft(id) {
    const state = load();
    return (state.drafts || []).find((x) => x.id === Number(id)) || null;
}

function createDraft({ module, owner_id, owner_name, title, data }) {
    const state = load();
    if (!state.drafts) state.drafts = [];
    const now = new Date().toISOString();
    const draft = { id: nextId(state, 'drafts'), module, owner_id: Number(owner_id), owner_name: owner_name || '', title: title || 'Untitled', data: data || {}, created_at: now, updated_at: now };
    state.drafts.push(draft);
    save(state);
    return draft;
}

function updateDraft(id, { title, data }) {
    const state = load();
    const draft = (state.drafts || []).find((x) => x.id === Number(id));
    if (!draft) return null;
    if (typeof title === 'string') draft.title = title;
    if (data) draft.data = data;
    draft.updated_at = new Date().toISOString();
    save(state);
    return draft;
}

function deleteDraft(id) {
    const state = load();
    if (!state.drafts) return false;
    const before = state.drafts.length;
    state.drafts = state.drafts.filter((x) => x.id !== Number(id));
    save(state);
    return state.drafts.length < before;
}

// ---------- First-run admin seeding ----------

if (countAdmins() === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@unitedinone.org';
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const name = process.env.ADMIN_NAME || 'Admin';
    const hash = bcrypt.hashSync(password, 10);
    insertAdmin({ name, email, password_hash: hash, role: 'admin' });
    console.log('----------------------------------------------------');
    console.log('No admin account found — created a default one:');
    console.log('  Email:    ' + email);
    console.log('  Password: ' + password);
    console.log('Set ADMIN_EMAIL / ADMIN_PASSWORD in .env before first');
    console.log('run to control this, and change the password after.');
    console.log('----------------------------------------------------');
}


// Seed the standard country field partners on first run
(function seedFieldPartners() {
    const state = load();
    if (!state.partners || state.partners.length === 0) {
        ['Kenya Field Partner', 'Nigeria Field Partner', 'Burundi Field Partner', 'Ghana Field Partner', 'Madagascar Field Partner']
            .forEach((n) => addFieldPartner(n));
    }
})();

module.exports = {
    ROLES,
    getAdminByEmail,
    getAdminById,
    listAdmins,
    countAdmins,
    insertAdmin,
    upsertAdminPassword,
    updateAdminPassword,
    updateAdmin,
    updateAdminPhoto,
    setResetToken,
    getAdminByResetToken,
    clearResetToken,
    listDraftsByOwner,
    getDraft,
    createDraft,
    updateDraft,
    deleteDraft,
    insertSubmission,
    insertFiles,
    listSubmissions,
    getSubmissionById,
    updateSubmissionStatus,
    markReviewedIfNew,
    getCounts,
    getFilesBySubmission,
    getFileById,
    getFileCountsMap,
    listFieldPartners,
    addFieldPartner,
    updateFieldPartner,
    removeFieldPartner,
    updateSubmissionData,
    setSubmissionDisplay,
};

// -----------------------------------------------------------------------------
// blobstore.js — one place that knows WHERE bytes live.
//
// On Vercel (when BLOB_READ_WRITE_TOKEN is present) everything is stored in a
// PRIVATE Vercel Blob store:
//   • the whole database is a single JSON object at "uiogf/db.json"
//   • every uploaded file is a private blob under "uiogf/uploads/..."
//
// On a normal machine (no token) it transparently falls back to the local
// filesystem exactly like the original app did — so `npm run dev` still works
// with no Vercel account and nothing to configure.
//
// Nothing else in the app imports @vercel/blob directly; they all go through
// here, which keeps the "swap storage" surface tiny.
// -----------------------------------------------------------------------------

const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const USE_BLOB = !!TOKEN;

// Lazily require the SDK so local dev never needs the package resolved at import.
let _sdk = null;
function sdk() {
    if (!_sdk) _sdk = require('@vercel/blob');
    return _sdk;
}

// Extend the function's lifetime on Vercel until a background write finishes,
// so a fire-and-forget DB flush can't be cut off when the response is sent.
let _waitUntil = null;
try { _waitUntil = require('@vercel/functions').waitUntil; } catch (_) { /* not on Vercel */ }

const ROOT = path.join(__dirname, '..');
const LOCAL_DATA_DIR = path.join(ROOT, 'data');
const LOCAL_UPLOAD_DIR = path.join(ROOT, 'uploads');
const LOCAL_DB_FILE = path.join(LOCAL_DATA_DIR, 'db.json');

const DB_PATHNAME = 'uiogf/db.json';
const UPLOAD_PREFIX = 'uiogf/uploads/';

function streamToString(webStream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        const nodeStream = Readable.fromWeb(webStream);
        nodeStream.on('data', (c) => chunks.push(c));
        nodeStream.on('error', reject);
        nodeStream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
}

// ---------------------------------------------------------------------------
// Database document (single JSON blob)
// ---------------------------------------------------------------------------

// Returns the parsed DB, or null when the store is genuinely empty (first run).
// THROWS on any real read/parse error — the caller must then refuse to seed or
// overwrite, so a transient Blob hiccup can never wipe live data.
async function loadDb() {
    if (USE_BLOB) {
        let res;
        try {
            // useCache:false → always read the latest write (correctness > speed).
            res = await sdk().get(DB_PATHNAME, { access: 'private', useCache: false });
        } catch (err) {
            if (isNotFound(err)) return null; // never uploaded yet → first run
            throw err;                        // real error → do NOT treat as empty
        }
        if (!res || res.statusCode === 404) return null;
        if (res.statusCode !== 200 || !res.stream) {
            throw new Error('Blob DB read returned status ' + (res && res.statusCode));
        }
        const text = await streamToString(res.stream);
        return JSON.parse(text); // parse errors propagate on purpose
    }
    if (!fs.existsSync(LOCAL_DB_FILE)) return null;
    return JSON.parse(fs.readFileSync(LOCAL_DB_FILE, 'utf8'));
}

// Persist the DB. Local mode writes synchronously + atomically. Blob mode returns
// a promise and registers it with waitUntil so Vercel keeps the instance alive
// until the upload completes — callers do not need to await.
function persistDb(state) {
    if (USE_BLOB) {
        const p = writeDbBlob(state).catch((err) =>
            console.error('[blobstore] DB flush failed:', err.message));
        if (_waitUntil) { try { _waitUntil(p); } catch (_) { /* ignore */ } }
        return p;
    }
    try {
        if (!fs.existsSync(LOCAL_DATA_DIR)) fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
        const tmp = LOCAL_DB_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
        fs.renameSync(tmp, LOCAL_DB_FILE);
    } catch (err) {
        console.error('[blobstore] local DB write failed:', err.message);
    }
    return Promise.resolve();
}

async function writeDbBlob(state) {
    const { put } = sdk();
    await put(DB_PATHNAME, JSON.stringify(state, null, 2), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 0,
    });
}

// ---------------------------------------------------------------------------
// Uploaded files
// ---------------------------------------------------------------------------

// Store a buffer and return the value we persist as `stored_name`.
// Blob mode → the blob pathname (e.g. "uiogf/uploads/169..-ab.pdf").
// Local mode → a flat filename inside ./uploads (back-compatible with old rows).
async function putFile(buffer, storedName, contentType) {
    if (USE_BLOB) {
        const { put } = sdk();
        const res = await put(UPLOAD_PREFIX + storedName, buffer, {
            access: 'private',
            addRandomSuffix: false,
            contentType: contentType || 'application/octet-stream',
        });
        return { storedName: res.pathname, url: res.url, size: buffer.length };
    }
    if (!fs.existsSync(LOCAL_UPLOAD_DIR)) fs.mkdirSync(LOCAL_UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_UPLOAD_DIR, storedName), buffer);
    return { storedName, url: null, size: buffer.length };
}

// Stream a stored file to an Express response. Returns true if served, false if
// the file could not be found (caller then sends 404).
async function sendFile(res, storedName, { contentType, filename, inline = true } = {}) {
    if (!storedName) return false;

    if (USE_BLOB && storedName.includes('/')) {
        let result;
        try {
            result = await sdk().get(storedName, { access: 'private', useCache: false });
        } catch (err) {
            if (isNotFound(err)) return false;
            console.error('[blobstore] get failed:', err.message);
            return false;
        }
        if (!result || result.statusCode !== 200 || !result.stream) return false;
        res.setHeader('Content-Type', contentType || result.blob.contentType || 'application/octet-stream');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'private, no-cache');
        if (filename) res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${cleanName(filename)}"`);
        Readable.fromWeb(result.stream).pipe(res);
        return true;
    }

    // Local fallback (also handles legacy flat stored names on Vercel-less runs).
    const fp = path.join(LOCAL_UPLOAD_DIR, path.basename(storedName));
    if (!fs.existsSync(fp)) return false;
    if (contentType) res.setHeader('Content-Type', contentType);
    if (filename) res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${cleanName(filename)}"`);
    res.sendFile(fp);
    return true;
}

// Best-effort delete (used when an upload is rolled back mid-request).
async function removeFile(storedName, url) {
    try {
        if (USE_BLOB) {
            if (url || (storedName && storedName.includes('/'))) {
                await sdk().del(url || storedName);
            }
            return;
        }
        if (storedName) {
            const fp = path.join(LOCAL_UPLOAD_DIR, path.basename(storedName));
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
    } catch (err) {
        console.error('[blobstore] removeFile failed:', err.message);
    }
}

function isNotFound(err) {
    if (!err) return false;
    if (err.name && /notfound/i.test(err.name)) return true;
    if (err.status === 404 || err.statusCode === 404) return true;
    return /not\s*found/i.test(err.message || '');
}
function cleanName(s) { return String(s).replace(/["\r\n]/g, ''); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

module.exports = {
    USE_BLOB,
    UPLOAD_PREFIX,
    loadDb,
    persistDb,
    putFile,
    sendFile,
    removeFile,
};

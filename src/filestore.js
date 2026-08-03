// -----------------------------------------------------------------------------
// filestore.js — the multer plumbing for uploads + a helper for downloads.
//
// blobStorage() is a drop-in replacement for multer.diskStorage(): every route
// that had `multer.diskStorage({...})` now uses `blobStorage()` and NOTHING else
// in that route changes. The engine buffers the incoming file and hands it to
// blobstore.putFile(), which writes to a private Vercel Blob (prod) or ./uploads
// (dev). It still sets `file.filename` (= the value stored as `stored_name`),
// `file.size` and `file.blobUrl`, so db.insertFiles() keeps working untouched.
//
// sendStoredFile()/sendStoredName() replace the old `res.sendFile(...)` download
// blocks and stream the bytes back through the authenticated admin route.
// -----------------------------------------------------------------------------

const path = require('path');
const crypto = require('crypto');
const store = require('./blobstore');

function newStoredName(originalname) {
    const ext = path.extname(originalname || '').slice(0, 12); // guard weird extensions
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

// Custom multer StorageEngine backed by blobstore.
function blobStorage() {
    return {
        _handleFile(req, file, cb) {
            const chunks = [];
            let limited = false;
            file.stream.on('data', (c) => chunks.push(c));
            file.stream.on('limit', () => { limited = true; }); // multer size limit tripped
            file.stream.on('error', cb);
            file.stream.on('end', () => {
                if (limited) return cb(new Error('File too large'));
                const storedName = newStoredName(file.originalname);
                store.putFile(Buffer.concat(chunks), storedName, file.mimetype)
                    .then((saved) => cb(null, {
                        filename: saved.storedName,
                        size: saved.size,
                        blobUrl: saved.url || undefined,
                        path: saved.url || undefined,
                    }))
                    .catch(cb);
            });
        },
        _removeFile(req, file, cb) {
            store.removeFile(file.filename, file.blobUrl).then(() => cb(null)).catch(() => cb(null));
        },
    };
}

// Stream a DB file row (as produced by db.insertFiles) to the response.
// Preserves the original inline-with-filename behaviour of the old handlers.
async function sendStoredFile(res, fileRow) {
    if (!fileRow) { res.status(404).send('File not found'); return; }
    const ok = await store.sendFile(res, fileRow.stored_name, {
        contentType: fileRow.mime_type,
        filename: fileRow.original_name,
        inline: true,
    });
    if (!ok) res.status(404).send('File missing from storage');
}

// Stream a bare stored name (used for profile-photo avatars).
async function sendStoredName(res, storedName, opts = {}) {
    const ok = await store.sendFile(res, storedName, { inline: true, ...opts });
    if (!ok) res.status(404).end();
}

module.exports = { blobStorage, sendStoredFile, sendStoredName };

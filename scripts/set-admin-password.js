// Usage: node scripts/set-admin-password.js "Full Name" you@example.org "NewPassword123!"
// Creates the account if it doesn't exist, otherwise updates its password (and name).

const bcrypt = require('bcryptjs');
const db = require('../src/db');

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
    console.log('Usage: node scripts/set-admin-password.js "Full Name" you@example.org "NewPassword123!"');
    process.exit(1);
}

// Hydrate the datastore from storage first — otherwise we'd operate on an empty
// in-memory DB and overwrite the real data on save.
db.ready().then(() => {
    const hash = bcrypt.hashSync(password, 10);
    const { created } = db.upsertAdminPassword({ name, email, password_hash: hash });
    console.log(created ? `Created new admin: ${email}` : `Updated password for existing admin: ${email}`);
    process.exit(0);
}).catch((err) => {
    console.error('Failed to load the database:', err.message);
    process.exit(1);
});

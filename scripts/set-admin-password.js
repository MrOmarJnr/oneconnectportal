// Usage: node scripts/set-admin-password.js "Full Name" you@example.org "NewPassword123!"
// Creates the account if it doesn't exist, otherwise updates its password (and name).

const bcrypt = require('bcryptjs');
const db = require('../src/db');

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
    console.log('Usage: node scripts/set-admin-password.js "Full Name" you@example.org "NewPassword123!"');
    process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
const { created } = db.upsertAdminPassword({ name, email, password_hash: hash });

if (created) {
    console.log(`Created new admin: ${email}`);
} else {
    console.log(`Updated password for existing admin: ${email}`);
}

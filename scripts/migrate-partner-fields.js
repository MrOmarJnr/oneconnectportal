#!/usr/bin/env node
/*
 * One-time migration: fix "Unnamed Partner" business records that came from the
 * website partnership form before the field-mapping fix.
 *
 * Older submissions stored the form's friendly labels ("Full Name", "Email",
 * "Organization Name", ...) verbatim. The Business module reads snake_case keys
 * (partner_name, contact_name, contact_email, ...), so those records show blank.
 * This script re-maps the friendly labels onto the schema keys, folds the extra
 * fields into Notes, and recomputes the display name/subtitle.
 *
 * Safe to run more than once (idempotent) and makes a timestamped backup first.
 *
 *   cd portal && node scripts/migrate-partner-fields.js
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function pick(data, ...keys) {
    for (const k of keys) {
        const v = data[k];
        if (Array.isArray(v)) { if (v.length) return v.join(', '); }
        else if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
}

function remap(data) {
    const notesParts = [];
    const addr = pick(data, 'Organization Address', 'organization_address');
    if (addr) notesParts.push('Organization Address: ' + addr);
    const programs = pick(data, 'Programs', 'programs');
    if (programs) notesParts.push('Programs of Interest: ' + programs);
    const opportunity = pick(data, 'Partnership Opportunity', 'partnership_opportunity');
    if (opportunity) notesParts.push('Partnership Opportunity: ' + opportunity);
    const timeline = pick(data, 'Timeline', 'timeline');
    if (timeline) notesParts.push('Timeline: ' + timeline);
    const extra = pick(data, 'Additional Information', 'additional_information', 'message');
    if (extra) notesParts.push('\n' + extra);

    return {
        source: 'website',
        status: ['prospective', 'active', 'inactive'].includes(data.status) ? data.status : 'prospective',
        partner_name: pick(data, 'Organization Name', 'organization_name', 'partner_name', 'company'),
        industry: pick(data, 'Industry', 'industry'),
        country: pick(data, 'Countries', 'Other Country', 'country'),
        website: pick(data, 'Website', 'website'),
        contact_name: pick(data, 'Full Name', 'full_name', 'contact_name', 'name'),
        contact_title: pick(data, 'Title', 'contact_title'),
        contact_email: pick(data, 'Email', 'email', 'contact_email'),
        contact_phone: pick(data, 'Phone Number', 'phone', 'contact_phone'),
        notes: notesParts.join('\n') || (data.notes || ''),
        support_type: Array.isArray(data.support_type) ? data.support_type : [],
    };
}

function main() {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const subs = db.submissions || [];

    // Only website-sourced business records that never got mapped (no partner_name
    // AND no contact_name in the schema keys) are candidates.
    const targets = subs.filter((s) =>
        s.type === 'business' &&
        s.data && s.data.source !== 'manual' &&
        !((s.data.partner_name && String(s.data.partner_name).trim()) ||
          (s.data.contact_name && String(s.data.contact_name).trim()))
    );

    if (!targets.length) {
        console.log('Nothing to migrate — no unmapped website partner records found.');
        return;
    }

    const backup = DB_PATH + '.bak-' + new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(backup, JSON.stringify(db, null, 2));
    console.log('Backup written to', backup);

    let fixed = 0;
    targets.forEach((s) => {
        const mapped = remap(s.data);
        s.data = mapped;
        s.display_name = mapped.partner_name || mapped.contact_name || 'Unnamed Partner';
        s.display_subtitle = [mapped.country].filter(Boolean).join(' • ') || 'Business Partner';
        fixed += 1;
        console.log('  #' + s.id + ' -> ' + s.display_name + (mapped.contact_email ? ' (' + mapped.contact_email + ')' : ''));
    });

    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    console.log('Done. Re-mapped ' + fixed + ' record(s).');
}

main();

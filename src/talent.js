// Talent Management config — Volunteer pipeline + Staffing profiles.

const VOLUNTEER_STAGES = ['applied', 'interviewed', 'onboarded', 'active'];
const STAGE_LABEL = { applied: 'Applied', interviewed: 'Interviewed', onboarded: 'Onboarded', active: 'Active' };

const PERSON_TYPES = ['Employee', 'Volunteer', 'Contractor', 'Board Member'];
const PROGRAMS = ['Global Classroom', 'Healthy Futures', 'Clean Water', 'Other'];
const COUNTRIES = ['Nigeria', 'Kenya', 'Burundi', 'Ghana', 'Madagascar', 'Other'];
const STAFF_STATUSES = ['Active', 'Inactive', 'On Leave', 'Former'];

const STAFF_GROUPS = [
    { group: 'Basic Identity', fields: [
        { key: 'full_name', label: 'Full Name', type: 'text', required: true },
        { key: 'preferred_name', label: 'Preferred Name / Nickname', type: 'text' },
        { key: 'dob', label: 'Date of Birth', type: 'date' },
        { key: 'gender', label: 'Gender', type: 'text' },
    ] },
    { group: 'Contact Info', fields: [
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'phone', label: 'Phone Number', type: 'text' },
        { key: 'mailing_address', label: 'Mailing Address', type: 'textarea' },
        { key: 'emergency_name', label: 'Emergency Contact — Name', type: 'text' },
        { key: 'emergency_relationship', label: 'Emergency Contact — Relationship', type: 'text' },
        { key: 'emergency_phone', label: 'Emergency Contact — Phone', type: 'text' },
    ] },
    { group: 'Role & Status', fields: [
        { key: 'person_type', label: 'Type', type: 'select', options: PERSON_TYPES },
        { key: 'position', label: 'Position / Title', type: 'text' },
        { key: 'program', label: 'Program / Department', type: 'select', options: PROGRAMS },
        { key: 'country', label: 'Country / Region', type: 'select', options: COUNTRIES },
        { key: 'start_date', label: 'Start Date', type: 'date' },
        { key: 'status', label: 'Status', type: 'select', options: STAFF_STATUSES },
    ] },
    { group: 'Availability', fields: [
        { key: 'timezone', label: 'Time Zone', type: 'text' },
    ] },
    { group: 'Skills & Qualifications', fields: [
        { key: 'certifications', label: 'Relevant Certifications / Skills', type: 'textarea' },
        { key: 'languages', label: 'Languages Spoken', type: 'text' },
        { key: 'education', label: 'Education Background', type: 'textarea' },
    ] },
    { group: 'Compliance & Legal', fields: [
        { key: 'background_check', label: 'Background Check Status', type: 'select', options: ['Not started', 'Pending', 'Cleared', 'Flagged'] },
        { key: 'signed_agreements', label: 'Signed Agreements', type: 'select', options: ['Yes', 'No', 'Partial'] },
        { key: 'tax_forms', label: 'Tax Forms (W-8BEN, etc.)', type: 'select', options: ['Not received', 'Received', 'N/A'] },
    ] },
    { group: 'Payment / Compensation', sensitive: true, fields: [
        { key: 'payment_method', label: 'Payment Method', type: 'text' },
        { key: 'rate_stipend', label: 'Rate / Stipend', type: 'text' },
        { key: 'bank_details', label: 'Bank Details (reference only — not encrypted yet)', type: 'textarea' },
    ] },
    { group: 'Performance & Engagement', fields: [
        { key: 'hours_logged', label: 'Hours Logged', type: 'number' },
        { key: 'notes_reviews', label: 'Notes / Reviews', type: 'textarea' },
        { key: 'training_completed', label: 'Training Completed', type: 'textarea' },
    ] },
];
const STAFF_KEYS = STAFF_GROUPS.reduce((a, g) => a.concat(g.fields.map((f) => f.key)), []);

function staffName(data) { return (data.full_name || '').trim() || 'Unnamed'; }
function staffSub(data) { return [data.position, data.country].filter(Boolean).join(' • ') || (data.person_type || 'Staff'); }

module.exports = {
    VOLUNTEER_STAGES, STAGE_LABEL,
    PERSON_TYPES, PROGRAMS, COUNTRIES, STAFF_STATUSES,
    STAFF_GROUPS, STAFF_KEYS, staffName, staffSub,
};

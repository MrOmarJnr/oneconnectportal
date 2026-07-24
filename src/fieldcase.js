// Schema + config for the "Create a Field Case" module.
// Derived from the UIOGF Field Visit Checklist and Field Documentation Form.

const COUNTRIES = ['Nigeria', 'Kenya', 'Burundi', 'Ghana', 'Madagascar', 'Other'];
const PROGRAM_TYPES = ['Education', 'Health', 'Water', 'Other'];
const STATUSES = ['new', 'reviewed', 'archived'];

// Step 1 of the checklist — the "standard questions" / Visit Information
const VISIT_FIELDS = [
    { key: 'field_partner',   label: 'Field Partner Name',                     type: 'text',   required: true },
    { key: 'visit_date',      label: 'Date of Visit',                          type: 'date',   required: true },
    { key: 'country',         label: 'Country / Region',                       type: 'select', options: COUNTRIES, required: true },
    { key: 'lga',             label: 'LGA / Local Area',                       type: 'text' },
    { key: 'distance_km',     label: 'One-Way Distance (km)',                  type: 'number' },
    { key: 'zone_confirmed',  label: 'Operating Zone Confirmed (≤150km)', type: 'select', options: ['Yes', 'No'] },
    { key: 'preapproval',     label: 'Pre-Approval Obtained if >150km',        type: 'select', options: ['Yes', 'No', 'N/A'] },
    { key: 'visit_type',      label: 'Visit Type',                             type: 'select', options: ['School', 'Community'], required: true },
    { key: 'location_name',   label: 'Name of School / Community',             type: 'text',   required: true },
    { key: 'est_population',  label: 'Estimated Student / Community Size',      type: 'number' },
];

// The checkbox groups (Steps 1–4 of the checklist)
const CHECK_GROUPS = [
    { name: 'school_checks', title: 'School Qualification Criteria', hint: 'All boxes must be checked for a school to qualify.', items: [
        'Physical location exists where children consistently gather for learning',
        'Structure can safely receive and store shipped supplies',
        'School has been operating for at least 6 months',
        'School is actively operating — not seasonal or abandoned',
        'Located in a rural or underserved community',
        'Limited or no access to government-supplied educational materials',
        'No active NGO already providing similar supplies to this school',
        'Minimum 20 children regularly and consistently attending',
        'Primarily serves children from low-income households',
        'At least 2 identified adults consistently serving as teachers or instructors',
        'Identifiable staff present during your visit',
        'Community members can confirm the school’s existence and ongoing activity',
        'Estimate of student population recorded',
    ] },
    { name: 'community_checks', title: 'Rural Community Qualification', hint: 'Both conditions must be confirmed for a non-school community.', items: [
        'Located in an underserved or remote area with limited access to healthcare or humanitarian supplies',
        'No active NGO partner already providing similar support in this community',
        'Estimate of community size recorded',
    ] },
    { name: 'disq_checks', title: 'Disqualification Check — confirm ALL', hint: 'If any cannot be confirmed, stop and report to your UIOGF leader.', items: [
        'Confirmed: Location is NOT on any international sanctions list',
        'Confirmed: Location is NOT associated with a terrorist organization, criminal enterprise, or armed group',
        'Confirmed: Location is NOT under active investigation by local or international authorities',
        'Confirmed: No prior diversion of Foundation funds or supplies has occurred at this location',
        'Confirmed: No individual in authority here has a known history of abuse or exploitation of children',
    ] },
    { name: 'coord_checks', title: 'Distribution Coordination (Step 2)', hint: 'Complete before coordinating a distribution.', items: [
        'Location confirmed as qualified (Step 1 complete)',
        'UIOGF notified of planned visit and distribution',
        'Supplies received from Foundation or confirmed en route',
        'Supplies inspected — no damage, tampering, or missing items upon receipt',
        'Distribution logistics planned',
        'Recipient list or estimate confirmed with school or community leader',
        'Photo and video consent confirmed',
    ] },
    { name: 'photo_checks', title: 'Content — Photography (Step 3A)', hint: 'Minimum 15 photos, vertical, original.', items: [
        'School entrance or community signage photographed',
        'Classrooms or community areas with recipients photographed',
        'Distribution in action photographed',
        'Before and after shots captured where applicable',
        'Minimum 15 photos total — clear, well-lit, in focus',
        'Photos shot in vertical (portrait) orientation',
        'All photos are original — not screenshots or downloaded images',
    ] },
    { name: 'video_checks', title: 'Content — Video (Step 3B)', hint: 'Vertical orientation, clear audio, no staging.', items: [
        'Pre-distribution walkthrough video recorded (3–5 min)',
        'Full distribution coverage video recorded (min 15 min)',
        'Interview video #1 recorded (~90s)',
        'Interview video #2 recorded (different person)',
        'Consent confirmed for all individuals filmed',
    ] },
    { name: 'submit_checks', title: 'Content Submission (Step 4)', hint: 'Submit within 48 hours of the visit.', items: [
        'All photos uploaded (min 15, original, vertical, unedited)',
        'Pre-distribution walkthrough video uploaded',
        'Full distribution coverage video uploaded',
        'Interview video #1 uploaded',
        'Interview video #2 uploaded',
        'Field Documentation Form submitted',
        'Route screenshot from Google/Apple Maps included',
        'Travel video included if route not on standard mapping tools',
        'Transportation receipts included',
    ] },
];

// Field Documentation Form — Part 1: Field Notes
const FIELD_NOTES = [
    { key: 'note_arrival',  label: 'What did the location look like when you arrived?', type: 'textarea' },
    { key: 'note_present',  label: 'Who was present during your visit?',               type: 'textarea' },
    { key: 'note_need',     label: 'Most pressing need you observed?',                  type: 'textarea' },
    { key: 'note_response', label: 'How did community members or students respond?',    type: 'textarea' },
    { key: 'rep1_name',     label: 'Main Representative — Name',                        type: 'text' },
    { key: 'rep1_role',     label: 'Main Representative — Role / Title',                type: 'text' },
    { key: 'rep2_name',     label: 'Interview Subject 2 — Name',                        type: 'text' },
    { key: 'rep2_role',     label: 'Interview Subject 2 — Role / Title',                type: 'text' },
    { key: 'note_other',    label: 'Other observations, concerns, or context',         type: 'textarea' },
];

// Part 2: Distribution Log
const DIST_LOG = [
    { key: 'total_served',       label: 'Total Individuals Served', type: 'number' },
    { key: 'children',           label: 'Children',                 type: 'number' },
    { key: 'adults',             label: 'Adults',                   type: 'number' },
    { key: 'supplies_accounted', label: 'All supplies accounted for?', type: 'select', options: ['Yes', 'No'] },
    { key: 'supplies_explain',   label: 'If no, explain',           type: 'text' },
    { key: 'accepted_payment',   label: 'Accepted any payment, gift, or benefit?', type: 'select', options: ['No', 'Yes'] },
    { key: 'payment_explain',    label: 'If yes, explain',          type: 'text' },
    { key: 'dist_items',         label: 'Itemized distribution log (item — qty sent / distributed / remaining / notes)', type: 'textarea' },
];

// Part 3: Impact Summary
const IMPACT = [
    { key: 'impact_summary',     label: 'Impact of this visit (1–2 sentences)',   type: 'textarea' },
    { key: 'standout',           label: 'A moment, story, or person that stood out', type: 'textarea' },
    { key: 'prioritize',         label: 'Prioritize this location for future support?', type: 'select', options: ['Yes', 'No', 'Maybe'] },
    { key: 'prioritize_explain', label: 'Explain',                                type: 'text' },
    { key: 'followup',           label: 'Follow-up required?',                    type: 'select', options: ['Yes', 'No'] },
    { key: 'followup_describe',  label: 'If yes, describe',                       type: 'textarea' },
];

function toArray(v) {
    if (v === undefined || v === null || v === '') return [];
    return Array.isArray(v) ? v : [v];
}

function displayNameFor(data) {
    return (data.location_name || '').trim() || 'Untitled Field Case';
}

function displaySubtitleFor(data) {
    return [data.field_partner, data.country, data.visit_date].filter(Boolean).join(' • ') || 'Field Case';
}

module.exports = {
    COUNTRIES, PROGRAM_TYPES, STATUSES,
    VISIT_FIELDS, CHECK_GROUPS, FIELD_NOTES, DIST_LOG, IMPACT,
    CHECK_GROUP_NAMES: CHECK_GROUPS.map((g) => g.name),
    toArray, displayNameFor, displaySubtitleFor,
};

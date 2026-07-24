// Human-readable labels + section grouping for each submission type.
// Keeps the admin views decoupled from the raw field names the public forms send.

const SECTIONS = {
    opportunity: [
        {
            title: 'Opportunity',
            fields: [
                ['opportunity', 'Role Applied For'],
                ['category', 'Category'],
                ['type', 'Type'],
            ],
        },
        {
            title: 'Applicant',
            fields: [
                ['full_name', 'Full Name'],
                ['email', 'Email Address'],
                ['phone', 'Phone Number'],
                ['location', 'Country / Location'],
                ['linkedin', 'LinkedIn / Portfolio'],
                ['availability', 'Availability'],
            ],
        },
        {
            title: 'Motivation',
            fields: [
                ['motivation', 'Why they want to volunteer'],
            ],
        },
    ],
    support: [
        {
            title: 'Organization Information',
            fields: [
                ['organization_name', 'Organization Name'],
                ['organization_type', 'Organization Type'],
                ['country', 'Country'],
                ['region', 'Region / Province / State'],
                ['city', 'City / Town'],
                ['website', 'Website'],
            ],
        },
        {
            title: 'Primary Contact',
            fields: [
                ['contact_name', 'Full Name'],
                ['contact_title', 'Title / Role'],
                ['contact_email', 'Email Address'],
                ['contact_phone', 'Phone Number'],
                ['contact_method', 'Preferred Contact Method'],
            ],
        },
        {
            title: 'Community Need',
            fields: [
                ['need_areas', 'Areas Needing Support'],
                ['situation_description', "Description of Situation"],
                ['people_impacted', 'People Impacted'],
                ['age_range', 'Estimated Age Range'],
            ],
        },
        {
            title: 'Partnership Details',
            fields: [
                ['partnership_type', 'Type of Partnership Sought'],
                ['prior_partnership', 'Partnered With an NGO Before?'],
                ['prior_partnership_detail', 'Prior Partnership Details'],
                ['timeline', 'Timeline / Urgency'],
            ],
        },
    ],
};

const CONSENT_FIELDS = {
    opportunity: [
        ['consent', 'Consented to data storage & review'],
    ],
    support: [
        ['consent_accuracy', 'Accuracy & Accountability'],
        ['consent_documents', 'Document Access & Sharing Authorization'],
        ['consent_privacy', 'Data Privacy Agreement'],
        ['consent_communication', 'Contact & Communication Consent'],
    ],
};

function formatValue(val) {
    if (val === undefined || val === null || val === '') return '—';
    if (Array.isArray(val)) return val.length ? val.join(', ') : '—';
    return String(val);
}

function buildSections(type, data) {
    const sections = SECTIONS[type] || [];
    return sections.map((section) => ({
        title: section.title,
        rows: section.fields.map(([key, label]) => ({
            label,
            value: formatValue(data[key]),
        })),
    }));
}

function buildConsent(type, data) {
    const fields = CONSENT_FIELDS[type] || [];
    return fields.map(([key, label]) => ({
        label,
        checked: data[key] === 'on' || data[key] === true || data[key] === 'true',
    }));
}

function displayNameFor(type, data) {
    if (type === 'opportunity') {
        return data.full_name || 'Unnamed Applicant';
    }
    return data.organization_name || data.contact_name || 'Unnamed Organization';
}

function displaySubtitleFor(type, data) {
    if (type === 'opportunity') {
        return [data.opportunity, data.type].filter(Boolean).join(' • ') || 'Opportunity Application';
    }
    return [data.organization_type, data.country].filter(Boolean).join(' • ') || 'Request for Support';
}

module.exports = { SECTIONS, CONSENT_FIELDS, buildSections, buildConsent, displayNameFor, displaySubtitleFor, formatValue };

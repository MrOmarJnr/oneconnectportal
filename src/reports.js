// Reporting aggregation engine — reads submissions and returns chart-ready data.
const db = require('./db');

function countBy(arr, keyFn) {
    const m = {};
    arr.forEach((x) => { const k = keyFn(x); if (k === undefined || k === null || k === '') return; m[k] = (m[k] || 0) + 1; });
    return m;
}
function countByMulti(arr, listFn) {
    const m = {};
    arr.forEach((x) => (listFn(x) || []).forEach((k) => { if (!k) return; m[k] = (m[k] || 0) + 1; }));
    return m;
}
function monthSeries(arr, dateFn) {
    const m = {};
    arr.forEach((x) => { const d = dateFn(x); if (!d) return; const key = new Date(d).toISOString().slice(0, 7); m[key] = (m[key] || 0) + 1; });
    const keys = Object.keys(m).sort();
    return { labels: keys, values: keys.map((k) => m[k]) };
}
function toPairs(obj) { const labels = Object.keys(obj); return { labels, values: labels.map((k) => obj[k]) }; }
function daysBetween(a, b) { return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)); }

function build() {
    const fieldCases = db.listSubmissions({ type: 'field_case' });
    const support = db.listSubmissions({ type: 'support' });
    const business = db.listSubmissions({ type: 'business' });
    const staff = db.listSubmissions({ type: 'staff' });
    const volunteers = db.listSubmissions({ type: 'opportunity' });

    const now = Date.now();
    const wstat = (r) => (['new', 'in_progress', 'closed'].includes(r.data.work_status) ? r.data.work_status : 'new');
    const bstat = (r) => (['prospective', 'active', 'inactive'].includes(r.data.status) ? r.data.status : 'prospective');
    const vstage = (r) => (['applied', 'interviewed', 'onboarded', 'active'].includes(r.data.stage) ? r.data.stage : 'applied');

    // ----- Field Cases -----
    const field = {
        total: fieldCases.length,
        byProgram: toPairs(countByMulti(fieldCases, (c) => c.data.program_type)),
        overTime: monthSeries(fieldCases, (c) => c.created_at),
        byCountry: toPairs(countBy(fieldCases, (c) => c.data.country)),
        list: fieldCases.map((c) => ({
            id: c.id, title: c.display_name, partner: c.data.field_partner || '—',
            date: (c.data.visit_date || c.created_at.slice(0, 10)),
            program: (c.data.program_type || []).join(', ') || '—',
            status: c.status,
        })),
    };

    // ----- Support -----
    const closed = support.filter((r) => wstat(r) === 'closed' && r.data.closed_at);
    const avgDays = closed.length ? (closed.reduce((s, r) => s + daysBetween(r.created_at, r.data.closed_at), 0) / closed.length) : null;
    const open = support.filter((r) => wstat(r) !== 'closed');
    const supportR = {
        total: support.length,
        byStatus: toPairs(countBy(support, wstat)),
        bySource: toPairs(countBy(support, (r) => (r.data.source === 'manual' ? 'Manual' : 'Website'))),
        byPartner: toPairs(countBy(support.filter((r) => r.data.assigned_to), (r) => r.data.assigned_to)),
        avgDays: avgDays === null ? null : Math.round(avgDays * 10) / 10,
        aging: open.map((r) => ({ id: r.id, name: r.display_name, status: wstat(r), assigned: r.data.assigned_to || 'Unassigned', age: daysBetween(r.created_at, now) }))
            .sort((a, b) => b.age - a.age),
    };

    // ----- Business -----
    const businessR = {
        total: business.length,
        byStatus: toPairs(countBy(business, bstat)),
        overTime: monthSeries(business, (r) => r.created_at),
        bySupportType: toPairs(countByMulti(business, (r) => r.data.support_type)),
        byDollar: (function () {
            const rows = business.filter((r) => Number(r.data.donation_amount) > 0)
                .map((r) => ({ name: r.display_name, amount: Number(r.data.donation_amount) }))
                .sort((a, b) => b.amount - a.amount).slice(0, 10);
            return { labels: rows.map((r) => r.name), values: rows.map((r) => r.amount) };
        })(),
        aging: business.map((r) => ({ id: r.id, name: r.display_name, status: bstat(r), since: r.data.partner_since || '', days: r.data.partner_since ? daysBetween(r.data.partner_since, now) : null }))
            .sort((a, b) => (b.days || 0) - (a.days || 0)),
    };

    // ----- Talent -----
    const stageOrder = ['applied', 'interviewed', 'onboarded', 'active'];
    const stageCounts = countBy(volunteers, vstage);
    const complianceRows = staff.map((s) => ({
        id: s.id, name: s.display_name,
        background: s.data.background_check || 'Not started',
        agreements: s.data.signed_agreements || 'No',
        tax: s.data.tax_forms || 'Not received',
    }));
    const talent = {
        volTotal: volunteers.length, staffTotal: staff.length,
        funnel: { labels: stageOrder.map((s) => s[0].toUpperCase() + s.slice(1)), values: stageOrder.map((s) => stageCounts[s] || 0) },
        volByOpportunity: toPairs(countBy(volunteers, (v) => v.data.opportunity || 'Unspecified')),
        volByStage: { labels: stageOrder.map((s) => s[0].toUpperCase() + s.slice(1)), values: stageOrder.map((s) => stageCounts[s] || 0) },
        staffByType: toPairs(countBy(staff, (s) => s.data.person_type)),
        staffByCountry: toPairs(countBy(staff, (s) => s.data.country)),
        staffByStatus: toPairs(countBy(staff, (s) => s.data.status)),
        compliance: complianceRows,
        hours: (function () {
            const rows = staff.filter((s) => Number(s.data.hours_logged) > 0)
                .map((s) => ({ name: s.display_name, hours: Number(s.data.hours_logged) }))
                .sort((a, b) => b.hours - a.hours).slice(0, 10);
            return { labels: rows.map((r) => r.name), values: rows.map((r) => r.hours) };
        })(),
    };

    // ----- Overview -----
    const countries = ['Nigeria', 'Kenya', 'Burundi', 'Ghana', 'Madagascar'];
    const byCountry = (arr, fn) => countries.map((c) => arr.filter((x) => (fn(x) || '') === c).length);
    const overview = {
        kpis: { field: fieldCases.length, support: support.length, business: business.length, staff: staff.length, volunteers: volunteers.length },
        activityByCountry: {
            labels: countries,
            cases: byCountry(fieldCases, (x) => x.data.country),
            staff: byCountry(staff, (x) => x.data.country),
        },
        impactByProgram: toPairs(countByMulti(fieldCases, (c) => c.data.program_type)),
    };

    return { field, support: supportR, business: businessR, talent, overview };
}

module.exports = { build };

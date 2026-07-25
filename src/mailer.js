// Lightweight Resend mailer using global fetch (Node 18+). No extra dependency.
// Safe no-op (logs a warning) if RESEND_API_KEY isn't set, so the app never crashes.

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const MAIL_FROM = process.env.MAIL_FROM || 'One Connect Portal <noreply@unitedinone.org>';
const PORTAL_URL = (process.env.PORTAL_URL || 'https://portal.unitedinone.org').replace(/\/+$/, '');

async function sendMail({ to, subject, html }) {
    if (!RESEND_API_KEY) {
        console.warn('[mailer] RESEND_API_KEY not set — skipping email:', subject, '->', to);
        return { ok: false, skipped: true };
    }
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html }),
        });
        if (!res.ok) {
            const body = await res.text();
            console.error('[mailer] Resend error', res.status, body);
            return { ok: false, error: body };
        }
        return { ok: true };
    } catch (err) {
        console.error('[mailer] send failed:', err.message);
        return { ok: false, error: err.message };
    }
}

function shell(title, bodyHtml) {
    return `<!DOCTYPE html><html><body style="margin:0;background:#f6f7fb;font-family:Inter,Arial,sans-serif;color:#23272e;">
    <div style="max-width:520px;margin:0 auto;padding:28px 20px;">
      <div style="text-align:center;margin-bottom:20px;">
        <span style="font-size:18px;font-weight:800;color:#23272e;">One Connect <span style="color:#6c5ce7;">Portal</span></span>
      </div>
      <div style="background:#fff;border-radius:16px;padding:28px 26px;border:1px solid #eef0f4;">
        <h1 style="font-size:19px;margin:0 0 14px;color:#23272e;">${title}</h1>
        ${bodyHtml}
      </div>
      <p style="text-align:center;color:#8a8fa3;font-size:11.5px;margin-top:18px;">United In One Global Foundation</p>
    </div></body></html>`;
}

function button(href, label) {
    return `<a href="${href}" style="display:inline-block;background:#6c5ce7;color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">${label}</a>`;
}

// ---- Templates ----
function credentialsEmail({ name, email, password, role }) {
    const roleLabel = { admin: 'Administrator', field: 'Field User', viewer: 'Viewer' }[role] || 'User';
    return {
        subject: 'Your One Connect Portal account',
        html: shell('Welcome to One Connect Portal', `
            <p style="font-size:14px;line-height:1.7;color:#475569;">Hi ${name}, an account has been created for you as a <strong>${roleLabel}</strong>. Use the credentials below to sign in, then change your password.</p>
            <div style="background:#f6f7fb;border-radius:10px;padding:14px 16px;font-size:14px;margin:16px 0;">
              <div><strong>Email:</strong> ${email}</div>
              <div><strong>Temporary password:</strong> ${password}</div>
            </div>
            <p style="margin:18px 0 6px;">${button(PORTAL_URL + '/login', 'Sign in')}</p>
            <p style="font-size:12px;color:#8a8fa3;margin-top:16px;">If you didn't expect this, you can ignore this email.</p>`),
    };
}

function resetEmail({ name, link }) {
    return {
        subject: 'Reset your One Connect Portal password',
        html: shell('Reset your password', `
            <p style="font-size:14px;line-height:1.7;color:#475569;">Hi ${name || 'there'}, we received a request to reset your password. Click below to choose a new one. This link expires in 1 hour.</p>
            <p style="margin:18px 0 6px;">${button(link, 'Reset password')}</p>
            <p style="font-size:12px;color:#8a8fa3;line-height:1.6;margin-top:16px;">If the button doesn't work, copy this link into your browser:<br><span style="color:#6c5ce7;word-break:break-all;">${link}</span></p>
            <p style="font-size:12px;color:#8a8fa3;margin-top:14px;">If you didn't request this, you can safely ignore this email — your password won't change.</p>`),
    };
}

function passwordResetByAdminEmail({ name, email, password }) {
    return {
        subject: 'Your One Connect Portal password was reset',
        html: shell('Your password was reset', `
            <p style="font-size:14px;line-height:1.7;color:#475569;">Hi ${name}, an administrator reset your password. Use the temporary password below to sign in, then change it.</p>
            <div style="background:#f6f7fb;border-radius:10px;padding:14px 16px;font-size:14px;margin:16px 0;">
              <div><strong>Email:</strong> ${email}</div>
              <div><strong>Temporary password:</strong> ${password}</div>
            </div>
            <p style="margin:18px 0 6px;">${button(PORTAL_URL + '/login', 'Sign in')}</p>`),
    };
}

module.exports = { sendMail, credentialsEmail, resetEmail, passwordResetByAdminEmail, PORTAL_URL };

# UIOGF Admin Portal

A self-contained login-protected admin portal that receives and manages:

- **Opportunity Applications** — submitted from `apply.html` on the main site
- **Request Support** submissions — submitted from `request-support.html` on the main site

Includes secure login, a dashboard listing every submission (filterable by type/status, searchable), a detail page per submission showing every field the person filled in, and secure download links for anything they uploaded (CVs, needs assessments, photos, etc).

This is a real Node.js + SQLite application — it needs to be run on a server (not just opened as a file), and the two form pages on your site need to point at it. Both are covered below.

---

## 1. Local setup (to try it out)

Requires [Node.js](https://nodejs.org) 18+. No build tools (Visual Studio / Xcode / Python) needed — every dependency is pure JavaScript, so `npm install` should just work on Windows, macOS, and Linux without any native compilation step.

```bash
cd admin-portal
npm install
cp .env.example .env
```

Open `.env` and set a real `SESSION_SECRET`, plus your preferred first admin email/password (these are only used the very first time the server starts, to create the first account).

```bash
npm start
```

You'll see something like:

```
No admin account found — created a default one:
  Email:    admin@unitedinone.org
  Password: ChangeMe123!
UIOGF admin portal running at http://localhost:3000
```

Visit `http://localhost:3000`, log in, and you'll land on the dashboard. It'll be empty until submissions come in.

### CORS (why this matters for local testing too)

`apply.html` and `request-support.html` are static pages, opened on a different origin than this server (a different port locally, e.g. `http://127.0.0.1:5500` from VS Code's Live Server; a different domain entirely in production). Browsers block cross-origin `fetch()` calls unless the server explicitly allows it — that's the "blocked by CORS" error in the console.

This is already handled: `/api/submit/*` sends the right CORS headers automatically. By default (`ALLOWED_ORIGINS` left blank in `.env`) it allows any origin, which is fine while you're testing locally. Before going to production, set `ALLOWED_ORIGINS` in `.env` to your real site's domain(s):

```
ALLOWED_ORIGINS=https://unitedinone.org,https://www.unitedinone.org
```

The `/admin` dashboard itself doesn't need any of this — you visit it directly in the browser, same-origin, so the login cookie just works normally.

---

## 2. Connecting your site's forms to this portal

Right now both forms are pointed at `http://localhost:3000` for local testing:

```html
<!-- apply.html -->
<form id="applyForm" action="http://localhost:3000/api/submit/opportunity" ...>

<!-- request-support.html -->
<form id="requestSupportForm" action="http://localhost:3000/api/submit/support" ...>
```

That works as long as the portal is running locally on your machine while you test. Once this project is deployed somewhere with a public URL (see Deployment below), update both `action` attributes to that live URL instead, e.g.:

```html
<form id="applyForm" action="https://portal.unitedinone.org/api/submit/opportunity" ...>
```

and set `ALLOWED_ORIGINS` in `.env` to your real site's domain (see the CORS note above) so only your site can submit to it in production.

---

## 3. Deployment

This is a standard Node.js app, so it runs on any host that supports Node: Render, Railway, Fly.io, a DigitalOcean droplet, an existing VPS, etc.

General steps for most platforms:
1. Push this folder to a Git repo (the `.gitignore` already excludes secrets/uploads/database).
2. Create a new Node.js web service pointing at that repo, with start command `npm start` (it runs `npm install` automatically on most platforms).
3. Set environment variables from `.env.example` in the platform's dashboard (`SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NODE_ENV=production`).
4. **Important:** the `data/` folder (SQLite database + sessions) and `uploads/` folder must be on **persistent storage** — most platforms wipe the filesystem on redeploy unless you attach a persistent disk/volume. Render, Railway, and Fly.io all support this ("Disks" / "Volumes" in their dashboards) — mount one at `/app/data` and `/app/uploads` (or wherever the app lives) so submissions and files survive deploys and restarts.
5. Once live, grab the public URL and update the two form `action` attributes as described above.

If you'd rather not manage a server yourself, a managed Postgres + file storage (S3) setup would scale further, but this SQLite + local-disk version handles a nonprofit's volume of applications/requests comfortably as-is.

---

## 4. Using the portal day-to-day

- **Dashboard** (`/admin`) — every submission, newest first. Filter by type (Opportunity / Support) or status (New / Reviewed / Archived) from the sidebar and status tabs, or search by name/organization.
- **Opening a submission** automatically marks it "Reviewed" so your team can see at a glance what's still new.
- **Detail page** — every field the applicant filled in, grouped the same way the form was (Organization Info, Contact, Community Need, etc. for support requests; Opportunity, Applicant, Motivation for job-style applications), plus a list of every uploaded file with a secure download link, and which consent boxes they checked.
- **Status dropdown** on the detail page lets you move something to Reviewed or Archived once you've dealt with it.
- File downloads (`/admin/files/:id`) are login-protected — only signed-in admins can access uploaded CVs/documents, they're not publicly reachable.

---

## 5. Managing admin accounts

The very first account is created automatically from `.env` on first run. To add another team member or reset a password later:

```bash
node scripts/set-admin-password.js "Full Name" "person@unitedinone.org" "TheirPassword123!"
```

Run this on the server (or locally against the same `data/portal.db` if you're managing it that way). It creates the account if the email doesn't exist yet, or updates the password if it does.

There's currently no self-serve "forgot password" flow — resetting a password means running that script again with a new password.

---

## 6. What's inside

```
admin-portal/
  server.js              — app entry point
  src/db.js               — JSON-file datastore (data/db.json) + default admin seeding
  src/auth.js              — login-required middleware
  src/format.js            — turns raw form data into labeled sections for the UI
  routes/public.js         — POST /api/submit/opportunity, /api/submit/support (called by the website)
  routes/auth.js           — /login, /logout
  routes/admin.js          — dashboard, detail view, status updates, file downloads (all login-protected)
  views/                   — EJS templates (login, dashboard, detail)
  public/admin.css         — portal styling, matches the site's earth/gold palette
  data/                    — db.json + session files (created automatically, persistent storage in production)
  uploads/                 — uploaded CVs/documents (created automatically, persistent storage in production)
  scripts/set-admin-password.js — CLI to create/reset admin accounts
```

No database server to install or manage — submissions live in `data/db.json`, a plain JSON file written atomically on every change. This keeps the whole project dependency-free of native modules, which is what caused the Windows install errors with the previous SQLite-based version. It comfortably handles a nonprofit's volume of applications; if submissions ever grow into the tens of thousands, migrating to a real database is a reasonable next step, but isn't needed to get started.

## 7. Security notes

- Passwords are hashed with bcrypt — never stored in plain text.
- Sessions are httpOnly cookies backed by files on disk (survive server restarts).
- File downloads and every `/admin/*` route require a logged-in session.
- Uploaded file types are restricted to PDF, Word docs, and JPG/PNG, capped at 10MB each, matching what the forms advertise.
- Set `NODE_ENV=production` when deploying behind HTTPS so cookies are marked `secure`.
- Change the default admin password immediately after first login using the script above.
- `data/db.json` contains every submission's data in plain text (not encrypted at rest) — make sure your deploy target restricts access to the filesystem/disk to your team only, same as you would with any database.
#   o n e c o n n e c t p o r t a l  
 
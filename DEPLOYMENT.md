# Deployment Plan

This project is best deployed as:

- a static frontend build
- a Node.js backend process
- a persistent SQLite database
- a persistent media directory for uploaded files and images

Because the backend stores uploaded covers, avatars, PDFs, and genre backgrounds on disk, the simplest production setup is a single VM or VPS for the backend, plus either:

- static frontend files served by a CDN/static host, or
- static frontend files served by the same reverse proxy

## Recommended Architecture

Use a single Linux VM for the backend and persistent storage:

- `Node.js 22+`
- `npm 10+`
- `better-sqlite3` running against a local persistent disk
- `systemd` to run the backend
- `Caddy` or `nginx` as the reverse proxy

Recommended paths:

- app code: `/srv/imkdiread/current`
- shared database: `/srv/imkdiread/shared/database.sqlite`
- shared backend media: `/srv/imkdiread/shared/public`
- frontend build output: `/srv/imkdiread/current/frontend/dist`

Important:

- `DB_PATH` is configurable and should point to the shared SQLite file.
- `backend/public` is where the backend serves uploaded/static media from.
- The backend code does not currently expose `STATIC_DIR` via env, so production should mount or symlink the shared media directory to `/srv/imkdiread/current/backend/public`.

## Environment Variables

Backend needs:

- `PORT`
- `DB_PATH`
- `BACKEND_URL`
- `JWT_SECRET`
- `GUEST_INVITE_CODE`
- `GEMINI_API_KEY`

Frontend needs:

- `VITE_API_BASE_URL`

Recommended backend values:

```env
PORT=3001
DB_PATH=/srv/imkdiread/shared/database.sqlite
BACKEND_URL=https://api.example.com
JWT_SECRET=replace-with-a-long-random-secret
GUEST_INVITE_CODE=replace-with-your-invite-code
GEMINI_API_KEY=replace-with-your-gemini-key
```

Recommended frontend value when frontend and backend are split:

```env
VITE_API_BASE_URL=https://api.example.com
```

If frontend and backend are served from the same origin through a reverse proxy, `VITE_API_BASE_URL` can be omitted.

## Persistent Data

These paths must survive deploys and restarts:

- SQLite DB file at `DB_PATH`
- `backend/public/files`
- `backend/public/imgs/covers`
- `backend/public/imgs/avatars`
- `backend/public/imgs/users/avatars`
- `backend/public/imgs/screensavers`
- `backend/public/imgs/genres`

Everything in `backend/public` should be treated as runtime data.

## First-Time Server Setup

1. Install system packages for Node, npm, and your reverse proxy.
2. Create deploy directories:

```bash
mkdir -p /srv/imkdiread/shared
mkdir -p /srv/imkdiread/shared/public
mkdir -p /srv/imkdiread/shared/public/files
mkdir -p /srv/imkdiread/shared/public/imgs/covers
mkdir -p /srv/imkdiread/shared/public/imgs/avatars
mkdir -p /srv/imkdiread/shared/public/imgs/users/avatars
mkdir -p /srv/imkdiread/shared/public/imgs/screensavers
mkdir -p /srv/imkdiread/shared/public/imgs/genres
```

3. Clone or sync the repo to `/srv/imkdiread/current`.
4. Symlink shared media into the release:

```bash
rm -rf /srv/imkdiread/current/backend/public
ln -s /srv/imkdiread/shared/public /srv/imkdiread/current/backend/public
```

5. Install dependencies:

```bash
cd /srv/imkdiread/current
npm install
```

6. Build frontend:

```bash
cd /srv/imkdiread/current
npm run build --prefix frontend
```

7. Ensure schema:

```bash
cd /srv/imkdiread/current/backend
DB_PATH=/srv/imkdiread/shared/database.sqlite npm run db:ensure
```

8. Create the first admin:

```bash
cd /srv/imkdiread/current/backend
DB_PATH=/srv/imkdiread/shared/database.sqlite ADMIN_USERNAME=admin ADMIN_PASSWORD=change-me npm run create-admin
```

9. Run smoke tests against a test database before go-live:

```bash
cd /srv/imkdiread/current/backend
npm run test:smoke
```

## Release Procedure

For each deploy:

1. Pull the new code into a fresh release or update the working tree.
2. Install dependencies:

```bash
cd /srv/imkdiread/current
npm install
```

3. Re-link `backend/public` to shared storage if needed.
4. Build frontend:

```bash
cd /srv/imkdiread/current
npm run build --prefix frontend
```

5. Apply schema drift fixes:

```bash
cd /srv/imkdiread/current/backend
DB_PATH=/srv/imkdiread/shared/database.sqlite npm run db:ensure
```

6. Restart backend.
7. Verify the live site.

You can automate the main release flow with:

```bash
cd /srv/imkdiread/current
bash scripts/deploy.sh --health-url https://api.example.com/api/health
```

Useful variants:

```bash
bash scripts/deploy.sh --skip-restart
bash scripts/deploy.sh --skip-smoke --service imkdiread
HEALTHCHECK_URL=https://api.example.com/api/health SYSTEMD_SERVICE=imkdiread bash scripts/deploy.sh
```

## Suggested Backend Service

Example `systemd` unit:

```ini
[Unit]
Description=imkdiread backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/imkdiread/current/backend
Environment=PORT=3001
Environment=DB_PATH=/srv/imkdiread/shared/database.sqlite
Environment=BACKEND_URL=https://api.example.com
Environment=JWT_SECRET=replace-with-a-long-random-secret
Environment=GUEST_INVITE_CODE=replace-with-your-invite-code
Environment=GEMINI_API_KEY=replace-with-your-gemini-key
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

## Suggested Reverse Proxy

Example `Caddyfile` with split frontend/backend domains:

```caddy
app.example.com {
  root * /srv/imkdiread/current/frontend/dist
  file_server
  try_files {path} /index.html
}

api.example.com {
  reverse_proxy 127.0.0.1:3001
}
```

If serving both from one domain, proxy `/api`, `/imgs`, and `/files` to the backend and serve the frontend build for everything else.

## Post-Deploy Verification

Check these after each deploy:

1. Frontend loads and login page renders.
2. Admin login works.
3. `GET /api/health` returns `200`.
4. Explore page loads.
5. Detail page loads a work with:
   - cover
   - author link
   - tag dropdown
   - quotes
6. Upload flows still work:
   - work cover upload
   - author avatar upload
   - user avatar upload
   - PDF upload
7. Goodreads and Dropbox actions still open correctly.
8. Dictionary/Gemini actions work if `GEMINI_API_KEY` is configured.

## Backup Plan

Back up both:

- `/srv/imkdiread/shared/database.sqlite`
- `/srv/imkdiread/shared/public`

Minimum recommendation:

- daily SQLite backup
- daily media directory backup
- keep at least 7 daily restore points

For safer SQLite backups, stop the backend briefly during backup or use SQLite's online backup support through an external script.

## Known Deployment Constraints

- Public profiles are intentionally only visible to logged-in users.
- There is no dedicated unauthenticated health endpoint yet.
- Gemini-powered dictionary features depend on `GEMINI_API_KEY`.
- SQLite is appropriate for a single-node deployment, not a multi-writer horizontally scaled backend.

## Recommended Next Follow-Ups

- add `/api/health` for load balancer and uptime checks
- add `.env.example` files for backend and frontend
- automate deploy steps in a shell script or CI workflow
- automate database and media backups

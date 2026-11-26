<div align="center">

# ✈ Telegram Control Panel

**A self-hosted web platform for managing Telegram user accounts.**

Manage several accounts from one browser tab: profile, security and privacy, chats, contacts,
messages, media, bulk operations, scheduled broadcasts and live location, all running as
resumable background jobs.

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![GramJS](https://img.shields.io/badge/MTProto-GramJS-26A5E4?logo=telegram&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-SQLite-2D3748?logo=prisma)
![Self-hosted](https://img.shields.io/badge/self--hosted-yes-success)

</div>

---

## Table of contents

- [What it is](#what-it-is)
- [Features](#features)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Adding Telegram accounts](#adding-telegram-accounts)
- [Using the panel](#using-the-panel)
- [Production deployment](#production-deployment)
- [Security model](#security-model)
- [Telegram limits & responsible use](#telegram-limits--responsible-use)
- [HTTP API](#http-api)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Roadmap](#roadmap)
- [Disclaimer](#disclaimer)

---

## What it is

Telegram Control Panel signs in to **your own Telegram user accounts** (not bots) over MTProto
through [GramJS](https://gram.js.org), the same protocol the official apps use. It gives you a
password-protected web dashboard for everything the Telegram apps make tedious: exporting and
cleaning up chat history, moving messages between chats, leaving hundreds of groups at once,
reviewing which devices are logged in, broadcasting an announcement to your channels, and so on.

Everything runs on your server. Session files, the database and downloaded media never leave it.

---

## Features

### 👥 Multi-account management
- Add any number of Telegram accounts from the web UI (phone → code → 2FA password wizard) or the CLI.
- Switch the active account from the sidebar; every page, job and log is scoped to an account.
- Per-account isolated session file, database records and download folder.
- Remove an account from the panel: it is disconnected and its session file deleted. Indexed data is
  kept hidden, so you can re-add the account later.

### 🪪 Profile
- Edit first name, last name and bio (shows the 70 / 140 character limit for Premium accounts).
- Set, change or remove the **username** with a live availability check.
- Upload a new **profile photo** (JPG / PNG / WebP) or remove the current one.
- See Premium / Verified status, phone number and user ID at a glance.

### 🛡 Security & privacy
- **Active sessions**: list every device logged in to the account (app, version, platform, IP,
  location, last activity). Unofficial apps and sessions waiting for 2FA are flagged.
- **Terminate** a single session, or **all other sessions** in one click (with typed confirmation).
- **Two-step verification status**: enabled or not, hint, recovery email.
- **Privacy settings**: last seen, phone number, profile photo, bio, forwarded-message link, calls,
  group invites and voice messages, each set to Everybody / My contacts / Nobody. Rules with
  per-user exceptions are detected, and you are warned before they are overwritten.
- **Account self-destruct timer** (1 month to 2 years of inactivity).

### ✉ Send & broadcast
- Send a message to one chat or up to **500 recipients** in one job.
- Recipients by @username, t.me link, chat ID or `me` (Saved Messages), or add all synced
  private chats, groups, or channels where you are admin.
- Plain text, **Markdown** or **HTML** formatting, silent delivery, link preview toggle.
- **Native scheduled messages**: Telegram stores them and delivers at the chosen time even if your
  server is offline.
- Throttled delivery (configurable delay, minimum 2 s), review step with resolved recipients and
  ETA, resumable after restart without double-sending.

### 💬 Chats, contacts & messages
- **Sync** all contacts and dialogs (private chats, groups, supergroups, channels, bots), with
  admin / owner detection.
- **Chat browser** with type filters and search, per-chat statistics (photos, videos, files, voice,
  links, first/last message date).
- **Message indexer**: paginated background indexing of any accessible history, stored locally for
  fast search, filtering by type and date, and statistics.
- **Media browser**: metadata-only index; files are downloaded only when you ask.
- **Link extractor**: every URL found in indexed messages, grouped by domain.

### ⚙ Operations (all run as background jobs)
| Operation | What it does |
|---|---|
| Forward | Copy messages between chats in original order, optionally without the "forwarded from" header |
| Forward & clean up | Forward, then remove the copies from your own view of the destination |
| Export | Chat history to **JSON, CSV, TXT or HTML**, downloadable from the job page |
| Download media | Save photos, videos, files and voice messages to the server |
| Index | Store messages locally for search and stats |
| Delete messages | Delete for me or for everyone (where Telegram allows), filtered by type and date |
| Join / Leave | Join by @username or invite link; leave a group or channel |
| Mark as read | Clear a chat's unread counter |
| Leave all groups / channels | Bulk leave, with a preview list and typed confirmation |
| Delete all private chats | Bulk history cleanup, for you or for everyone |

Every operation supports **content filters** (photos, videos, files, music, voice, GIFs, stickers,
text, links) and an optional **date range**, and shows a **review step** with an estimated message
count before anything happens.

### ⟳ Background jobs
- Dedicated worker process (or embedded mode for small setups), configurable concurrency, at most
  one job per account at a time.
- **Pause / resume / cancel / retry** from the UI, with a live progress bar.
- **Checkpoints**: long jobs continue from where they stopped after a crash or restart.
- Automatic FloodWait handling: the worker sleeps through Telegram's rate limits instead of failing.

### 📍 Live location
- Share a phone's GPS position to any chat as a Telegram live location.
- Each session gets a private share link; open it on the phone and it streams coordinates to the
  server, which updates the live-location message over MTProto.
- Configurable duration and update interval; location history auto-expires.

### 📋 Activity log & admin
- Audit log of every action (logins, syncs, jobs, sends, profile and security changes) with IP address.
- Admin login with rate limiting (8 failed attempts per 15 min per IP), bcrypt hash support,
  HTTP-only encrypted session cookie.
- Responsive UI with RTL text support.

---

## How it works

```
 Browser ──HTTPS──▶ Next.js (web)  ───────────────┐
                     │  pages + /api routes       │
                     │  creates QUEUED jobs       ▼
                     │                        SQLite (Prisma)
                     ▼                            ▲
              GramJS client pool ◀── Worker ──────┘
                     │            (claims jobs, checkpoints progress)
                     ▼
              Telegram (MTProto)
```

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Next.js 14 (App Router), React 18, Tailwind CSS |
| Telegram | GramJS (`telegram` npm package), MTProto user API |
| Database | SQLite via Prisma ORM |
| Auth | iron-session (encrypted HTTP-only cookie), bcrypt |
| Processes | PM2 (`tcp-web` + `tcp-worker`) |

---

## Quick start

**Requirements:** Node.js 18+, npm 9+, and a Telegram API ID / hash from
[my.telegram.org/apps](https://my.telegram.org/apps).

```bash
git clone https://github.com/<you>/telegram-control-panel.git
cd telegram-control-panel
npm install

cp .env.example .env          # then edit .env (see below)
npm run db:deploy             # create the SQLite database
npm run build
```

For a quick local try-out set `EMBEDDED_WORKER=true` in `.env` and run:

```bash
npm run dev                   # http://localhost:4567
```

Log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`, open **Accounts → Add account**, and sign in with
your phone number.

---

## Configuration

All settings live in `.env` (see [`.env.example`](.env.example)).

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_API_ID` | ✅ | | API ID from my.telegram.org |
| `TELEGRAM_API_HASH` | ✅ | | API hash from my.telegram.org |
| `DATABASE_URL` | ✅ | `file:./data/telegramcontrolpanel.db` | SQLite path (relative to `prisma/`) |
| `ADMIN_USERNAME` | ✅ | `admin` | Panel login name |
| `ADMIN_PASSWORD` | ✅ | | Panel password, plain text or a bcrypt hash (`$2…`) |
| `SESSION_SECRET` | ✅ | | ≥ 32 random characters (`openssl rand -hex 32`) |
| `COOKIE_SECURE` | | `false` | `true` **only** when served over HTTPS, otherwise login silently fails |
| `WEB_HOST` | | `127.0.0.1` | Bind address for PM2 (`0.0.0.0` to expose directly) |
| `WEB_PORT` | | `4567` | Web port |
| `EMBEDDED_WORKER` | | `false` | `true` runs jobs inside the web process. Never combine with a separate worker |
| `WORKER_CONCURRENCY` | | `3` | Max jobs running at once (one per account) |
| `LOCATION_RETENTION_DAYS` | | `7` | How long GPS points are kept |

> The API ID/hash identify the *application*, not an account. All accounts can share one pair.

---

## Adding Telegram accounts

**From the web UI (recommended):** Accounts → *Add account* → enter the phone number in
international format → enter the code Telegram sends you → enter your cloud password if 2FA is on.

**From the command line:**

```bash
npm run login                                     # interactive
npm run login -- --slug=work --label="Work phone" # preset id and label
```

Session strings are saved in `sessions/<slug>.session`. **Treat them like passwords:** anyone with
the file has full access to the account.

---

## Using the panel

| Page | Path | Purpose |
|---|---|---|
| Dashboard | `/dashboard` | Connection status, statistics, active jobs, one-click sync |
| Accounts | `/accounts` | Add, select, re-sync and remove accounts |
| Profile | `/profile` | Name, bio, username, profile photo |
| Security & Privacy | `/security` | Sessions, 2FA status, privacy rules, self-destruct timer |
| Chats | `/chats` | All dialogs, filters, per-chat stats and indexing |
| Contacts | `/contacts` | Contacts and known message senders |
| Messages | `/messages` | Search indexed messages |
| Media | `/media` | Indexed media, download on demand |
| Links | `/links` | URLs extracted from messages |
| Send & Broadcast | `/send` | Send now or schedule, to one or many chats |
| Operations | `/control` | Forward, export, download, delete, join, leave, bulk cleanup |
| Jobs | `/jobs` | Progress, pause / resume / cancel, results and export downloads |
| Live Location | `/location` | Start/stop live-location sessions and get the phone share link |
| Activity Log | `/logs` | Full audit trail |
| Settings | `/settings` | Worker status, storage paths, security checklist |

**Typical first run:** add an account → *Sync* on the dashboard → open a chat → *Index* → browse
messages, media and links, or run operations from **Operations**.

---

## Production deployment

### 1. Run with PM2

```bash
npm install -g pm2
npm run db:deploy && npm run build
pm2 start ecosystem.config.js     # starts tcp-web and tcp-worker
pm2 save && pm2 startup           # survive reboots
```

Keep `EMBEDDED_WORKER=false` here; the `tcp-worker` process runs the jobs.

### 2. Put it behind HTTPS

**Nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name panel.example.com;

    ssl_certificate     /etc/letsencrypt/live/panel.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.example.com/privkey.pem;

    client_max_body_size 12m;   # profile photo uploads

    location / {
        proxy_pass http://127.0.0.1:4567;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }
}
```

**Caddy:**

```caddy
panel.example.com {
    reverse_proxy 127.0.0.1:4567
}
```

Then set `COOKIE_SECURE=true` and restart.

### 3. Updating

```bash
git pull
npm install
npm run db:deploy
npm run build
pm2 restart tcp-web tcp-worker
```

### Backups

Back up `sessions/`, `prisma/data/` (the database) and `storage/` privately. None of them are, or
should ever be, committed to git.

---

## Security model

| Concern | Mitigation |
|---|---|
| Panel access | Single admin login; constant-time compare or bcrypt; IP rate limiting |
| Browser session | Encrypted, HTTP-only, SameSite cookie; `Secure` when `COOKIE_SECURE=true` |
| Telegram sessions | Stored server-side only, never sent to the browser |
| API hash | Server-side only |
| 2FA passwords | Passed straight to Telegram during login, never stored |
| Destructive operations | Review step first; bulk and irreversible actions need a typed confirmation |
| File downloads | Served through authenticated routes with path-traversal protection |
| Live-location share links | Unguessable per-session token, valid only while the session is active |
| Audit | Every action is logged with account, details and IP |

**Checklist:** long `ADMIN_PASSWORD`, random `SESSION_SECRET`, HTTPS + `COOKIE_SECURE=true`, bind
to `127.0.0.1` behind the proxy, firewall the app port, and enable 2FA on every Telegram account
you add. You can check the 2FA status on the **Security** page.

---

## Telegram limits & responsible use

- **FloodWait:** Telegram throttles bulk actions. The worker waits automatically (up to 5 minutes
  per wait) and continues, so don't restart it mid-wait.
- **Spam limits:** messaging many people who don't expect it gets accounts limited or banned. The
  broadcast feature is meant for your own channels, groups and contacts who expect your messages.
  Keep delays generous.
- **Privacy:** phone numbers and other private data are only shown when Telegram shares them with
  your account. The panel never tries to bypass privacy settings.
- **Protected content:** chats with forwarding restrictions can't be forwarded; affected messages are
  reported as skipped with Telegram's exact error.
- **Deletion:** "delete for everyone" only works where Telegram allows it; refusals are reported.
- **History access:** indexes contain what Telegram makes available to the account, which is not
  always the full history.
- Use this tool only with accounts you own or are authorised to manage, and in line with
  [Telegram's Terms of Service](https://telegram.org/tos) and the
  [API Terms](https://core.telegram.org/api/terms).

---

## HTTP API

All endpoints are under `/api`, require the admin session cookie (except the location point endpoint,
which uses its share token), and operate on the active account unless `?accountId=` is given.
Responses look like `{ "success": true, "data": … }` or `{ "success": false, "error": "…" }`.

| Endpoint | Methods | Purpose |
|---|---|---|
| `/api/auth/login`, `/api/auth/logout` | POST | Admin session |
| `/api/accounts`, `/api/accounts/:id`, `/api/accounts/:id/select` | GET POST PATCH DELETE | Accounts |
| `/api/accounts/login` | POST | Phone / code / 2FA login wizard |
| `/api/profile` | GET PATCH POST DELETE | Profile info, username check, photo upload/remove |
| `/api/security` | GET POST | Sessions, 2FA, privacy, self-destruct timer |
| `/api/send` | GET POST | Recipient groups; review / queue a send job |
| `/api/telegram/sync`, `/api/telegram/status` | POST GET | Sync and connection status |
| `/api/chats`, `/api/chats/:id`, `/api/chats/:id/index` | GET POST | Chats and indexing |
| `/api/contacts` | GET | Contacts |
| `/api/messages`, `/api/messages/links` | GET | Indexed messages and links |
| `/api/media`, `/api/media/:id/file` | GET | Media index and file download |
| `/api/control` | POST | Review / queue operations |
| `/api/jobs`, `/api/jobs/:id` | GET PATCH | Jobs and job control |
| `/api/export/:jobId` | GET | Download an export |
| `/api/location`, `/api/location/point` | GET POST | Live-location sessions and GPS points |
| `/api/logs`, `/api/system` | GET | Activity log and system status |

---

## Project structure

```
app/                  Next.js pages and /api route handlers
components/           Layout, sidebar, UI kit, chat picker
lib/                  Prisma client, session/auth helpers, logger, client utilities
server/
  jobs/               Job runner, worker loop, pause/cancel/checkpoint helpers
  telegram/           GramJS client pool and features (dialogs, messages, forward, export,
                      download, delete, profile, security, send, location, peer resolution)
  services/           Activity log
prisma/               Schema and migrations
scripts/              CLI login and the standalone worker
ecosystem.config.js   PM2 apps (tcp-web, tcp-worker)
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Login form does nothing / redirects back | `COOKIE_SECURE=true` on plain HTTP. Set it to `false`, or use HTTPS |
| `TELEGRAM_API_ID / TELEGRAM_API_HASH missing` | Fill them in `.env` |
| `PHONE_NUMBER_INVALID` | Use international format with country code, e.g. `+15551234567` |
| `No active account selected` | Accounts → *Select* |
| Jobs stay *Queued* | No worker running. Start `tcp-worker` / `npm run worker`, or set `EMBEDDED_WORKER=true` |
| Jobs run twice | Both the embedded and the separate worker are on. Use only one |
| Session expired / `AUTH_KEY_UNREGISTERED` | The session was terminated elsewhere. Remove and re-add the account |
| `P1003` database not found | `npm run db:deploy` |
| Type errors on build | `npm run db:generate`, then build again |
| Photo upload fails behind Nginx | Raise `client_max_body_size` |

Logs: `logs/web-*.log`, `logs/worker-*.log` (PM2) and the **Activity Log** page.

---

## Development

```bash
npm run dev          # Next.js dev server on :4567 (set EMBEDDED_WORKER=true)
npm run worker       # standalone job worker
npm run login        # CLI account login
npm run build        # production build
npm start            # production server
npm run db:migrate   # create a new migration (dev)
npm run db:deploy    # apply migrations
npm run db:studio    # browse the database
npm run db:generate  # regenerate the Prisma client
npm test             # tests
```

Adding a new job type: add it to `JobType` in `types/index.ts`, implement it in `server/telegram/`,
handle it in `server/jobs/runner.ts`, add a label in `lib/labels.ts`, and queue it from an API route.

---

## Roadmap

- [ ] Folder (chat filter) management
- [ ] Contact import / export (CSV, vCard)
- [ ] Auto-reply and keyword alerts
- [ ] Per-account API tokens and webhooks
- [ ] Multiple admin users with roles
- [ ] PostgreSQL support for large indexes
- [ ] Docker image

Contributions and issues are welcome.

---

## Disclaimer

This project is not affiliated with or endorsed by Telegram. It uses the public MTProto API. You are
responsible for how you use it and for complying with Telegram's terms and the law where you live.

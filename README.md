# Lodhi HQ

Shared task and habit board for Muhammad Hassan Lodhi and his staff. The browser app is a static Vite build. Sign-in and the board live in MySQL, behind a small PHP API in `api/`. Points, levels, badges, and shout-outs are calculated in the browser from the tasks, check-ins, and rewards stored there.

There is no Node server in production and no email is sent. Password resets are done by the owner from the Team screen.

## Features

- **Sign in** — email and password, before the board. Sessions use an HttpOnly, SameSite=Lax cookie (Secure on HTTPS). State-changing requests send a CSRF token. Sign-in is rate limited. Staff with a temporary password must choose a new one before they see the board.
- **Inbox** — quick-add, search, and filter by business tag, assignee, priority, due date, and status. Sort by deadline (soonest first) or priority (highest first). Mark a task done from the row; finishing a daily task schedules the next one.
- **Calendar** — daily timeline from 5 AM to 11 PM with tag-colored blocks, an Unscheduled today list, and drag-to-reschedule (or edit the task). Weekly Mon–Sun board with a task count and an overload warning when a day is over 8 hours. Toggle all businesses or one tag, and my tasks or the whole team.
- **Dashboard** — weekly completion, on-time rate, overdue count, and due today. Streaks for wake-up (before 6:00 AM), gym (5 sessions a week), and punctuality. Daily habit check-in (owner). Charts for completion by business, the 30-day on-time trend, and a team leaderboard.
- **Performance** — points (10 on time, 5 late, 15 per habit kept, 50 for a perfect week), levels from Starter to Machine, badges, a weekly appreciation note, automatic shout-outs for the top staff performer, and an editable rewards list.
- **Team** — the owner adds and edits staff, sets a temporary password, deactivates an account, and chooses which business tags that person can see. Staff see tasks assigned to them plus tasks in those businesses. The owner sees everything.
- **Integrations** — ClickUp, Google Calendar, the Cellphone Store POS, and Apple Reminders. The owner connects ClickUp and the store. Each person can connect a calendar and Reminders. A cron job and **Sync now** pull tasks into the board. Secrets stay encrypted in MySQL.

Tags: Cell Phone Store (blue), Essentials – e-commerce (orange), Tax Accounting Office (green), Hustler Autos – car dealership (red), Telconnect.us – marketing agency (purple), Personal (gray).

## Run locally

You need Node, PHP 8 with `pdo_mysql` and `mbstring`, and MySQL or MariaDB.

```bash
npm install
```

Create a database and user, then copy the config and point it at that database:

```bash
cp api/config.example.php api/config.php
```

`api/config.php` is gitignored. For this machine, `cookie_secure` can stay `null` (or `false` if you are on plain HTTP). The example host is `localhost`.

Start the API and the Vite app in two terminals:

```bash
npm run api
npm run dev
```

`npm run api` serves PHP at http://127.0.0.1:8080. Vite proxies `/api` to it, so open the URL Vite prints (usually http://localhost:5173) and visit http://localhost:5173/api/setup.php once. Create the owner account, optionally load the demo board, then sign in on the home page.

Use the same host for the installer and the app so the session cookie matches. On plain HTTP the session cookie is not marked Secure; on HTTPS it is.

To confirm a production build:

```bash
npm run build
```

`dist/` contains the SPA, `dist/.htaccess`, and `dist/api/` (without `config.php` or `setup.lock`). `npm run preview` serves the SPA only; the API still comes from `npm run api`.

## Deploy on Hostinger

The site is static files plus PHP. Upload it to the document root of a Shared or Cloud hosting plan that has PHP 8 and MySQL. Do not put it in a subfolder.

1. In hPanel, open **Databases → Management** and create a MySQL database and a user with all privileges on that database. Note the database name, user, password, and host. The host is usually `localhost`.
2. Turn on the free SSL certificate for the domain so the installer and sign-in run over HTTPS.
3. On your computer, from this repo: `npm install` then `npm run build`.
4. Upload the **contents** of `dist/` into `public_html`, so `index.html`, `.htaccess`, `assets/`, and `api/` sit directly in `public_html`. Do not upload a `dist` folder itself.
5. In `public_html/api`, copy `config.example.php` to `config.php`. Set `db.host`, `db.name`, `db.user`, and `db.pass`. Leave `cookie_secure` as `null` so the session cookie is Secure on HTTPS.
6. Open `https://your-domain/api/setup.php`. Enter the owner name (Muhammad Hassan Lodhi), email, and password. Check **Load the demo board** if you want the sample tasks, check-ins, rewards, and staff. Submit once.
7. Open `https://your-domain/` and sign in.

The installer writes `api/setup.lock` and a database flag, then refuses to run again. Deleting the lock file is not enough to run it a second time.

When you ship an update, build again and upload the new `dist/` contents over `public_html`, but leave the existing `api/config.php` and `api/setup.lock` in place. The build does not include those files. After this integrations update, also add `app_key`, run migrations, and create the cron job described below.

### Files you configure on the server

| File | What to set |
| --- | --- |
| `api/config.php` | Database host, name, user, and password. `app_key` for integration secrets. Optional `cron_token`. Copied from `config.example.php`. Never commit it. |
| MySQL database | Created in hPanel. The app does not create the database itself. |
| Owner password | Chosen on `/api/setup.php`. It is stored only as a hash. |

`api/.htaccess` denies web access to `config.php`, `config.example.php`, `schema.sql`, `setup.lock`, and the `api/lib/` PHP includes.

## Integrations

ClickUp, Google Calendar, the Cellphone Store POS, and Apple Reminders create and update tasks. One feed failing does not stop the others. Each card shows the last sync time, a short summary, and the last error.

Imported rows are updated, not copied. A task id `clickup-<id>` or `gcal-<event id>`, or notes ending in `[source: clickup:…]` / `[source: gcal:…]`, is the same row the sync writes. POS rows use `pos-<id>`. Reminders use `rem-<uid>`.

Secrets are encrypted with `app_key` and are never sent back to the browser. The screen only shows that a credential is saved.

Staff open Integrations to save their own calendar address and Apple Reminders. ClickUp, the store, migrations, and **Sync now** are owner-only. Staff visibility is unchanged: a synced task shows up only when it is assigned to them or carries a business tag the owner shared.

### Existing install on Hostinger

`setup.php` will not run again. Do not delete `api/setup.lock`.

1. On your computer: `npm install` then `npm run build`.
2. Upload the contents of `dist/` over `public_html`. Leave `api/config.php` and `api/setup.lock` in place.
3. Edit `public_html/api/config.php` and set `app_key` to a long random string. Generate one with `php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"`. Do not change it after credentials are saved, or they cannot be decrypted. `cron_token` can stay empty.
4. Apply `api/migrations/001_integrations.sql` once. Either sign in as the owner and use **Integrations → Run migrations**, or from SSH:

```bash
php /home/USER/domains/upscalewithlodhi.com/public_html/api/migrate.php
```

Replace `USER` with the Hostinger account directory. On some plans the site root is `/home/USER/public_html` instead of `domains/.../public_html`.

5. In hPanel open **Advanced → Cron Jobs**. Schedule `*/15 * * * *` and set the command to:

```bash
php /home/USER/domains/upscalewithlodhi.com/public_html/api/cron-sync.php
```

The script does nothing useful, and answers 403, if it is opened in a browser without `cron_token`. The PHP command above does not need that token.

6. Sign in as the owner at `https://upscalewithlodhi.com/` and open **Integrations**.

A new install already creates the tables from `api/schema.sql`. Still add `app_key`, run migrations once so the file is recorded, and create the cron job.

### Where to copy each credential

**ClickUp.** ClickUp → avatar → Settings → Apps → API Token → Generate. The token starts with `pk_`. Then load the workspace and tick the spaces to pull. Open tasks are assigned by matching the assignee email to a Lodhi HQ user, otherwise to the owner. The space or list named The Cellphone Store maps to the cell-phone tag unless you set a different row. Completing that task in Lodhi HQ sets the list's closed status in ClickUp.

**Google Calendar.** On the web: Settings (gear) → the calendar on the left → Integrate calendar → Secret address in iCal format. Paste the whole URL. The owner and each staff member save their own. The feed is read-only, from 7 days ago through the next 60 days. A daily repeating event is one task with daily recurrence, matching the earlier import. The iCal UID `abc@google.com` is stored as `gcal-abc`.

**Cellphone Store POS.** In the Supabase project behind the Lovable app: Project Settings → API. Copy the Project URL (`https://….supabase.co`) and the `service_role` key. The anon key works only when row security already allows the read. **Detect columns** fills id, title, notes, due, status, completed, assignee, and priority from common names; change any that do not match, then save. Optional: also read `refurb_tasks`. Tasks are tagged cell-phone. Completing one here sends a REST PATCH when a completed or status column is mapped. The value written to a status column is the "done" label on the card (default `done`).

**Apple Reminders.** appleid.apple.com → Sign-In and Security → App-Specific Passwords → create one named Lodhi HQ. Enter the Apple ID email and that password, then **Find lists** and tick the ones to sync. Apple's newer upgraded Reminders lists are often missing from CalDAV, especially shared lists. The screen lists every collection iCloud returned and which of them are reminder lists. Completing a synced reminder here writes the VTODO back with `STATUS:COMPLETED`.

Check a connection with **Sync now** or **Sync this**. The cron job repeats that every 15 minutes.

## Sample data

If you check the box on the installer, the demo board loads the first time the owner signs in. Dates are relative to that day, same as the old in-browser seed.

Sample staff can sign in with emails such as `store-staff@lodhi.local` and the temporary password `Lodhi-demo-1`. They are asked to change it. The owner can also set a new temporary password from Team.

**Reset sample data** in the sidebar replaces tasks, check-ins, rewards, and staff accounts with a fresh sample. The owner email and password stay. Staff accounts that were not part of the sample are removed.

## Stack

Vite, React, TypeScript, and Tailwind CSS in the browser. PHP 8 and MySQL/MariaDB (PDO, prepared statements) for the API. Integrations use PHP curl. No Composer and no framework.

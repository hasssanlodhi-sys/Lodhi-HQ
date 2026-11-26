# Lodhi HQ

Personal and team productivity app for Muhammad Hassan Lodhi. It runs entirely in the browser: tasks, check-ins, rewards, and team edits are stored in `localStorage`. There is no backend and nothing is deployed.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

To confirm a production build:

```bash
npm run build
```

The compiled site is written to `dist/`. `npm run preview` serves that folder.

## Features

- **Inbox** — quick-add, search, and filter by business tag, assignee, priority, due date, and status. Sort by deadline (soonest first) or priority (highest first). Mark a task done from the row; finishing a daily task schedules the next one.
- **Calendar** — daily timeline from 5 AM to 11 PM with tag-colored blocks, an Unscheduled today list, and drag-to-reschedule (or edit the task). Weekly Mon–Sun board with a task count and an overload warning when a day is over 8 hours. Toggle all businesses or one tag, and my tasks or the whole team.
- **Dashboard** — weekly completion, on-time rate, overdue count, and due today. Streaks for wake-up (before 6:00 AM), gym (5 sessions a week), and punctuality. Daily habit check-in. Charts for completion by business, the 30-day on-time trend, and a team leaderboard.
- **Performance** — points (10 on time, 5 late, 15 per habit kept, 50 for a perfect week), levels from Starter to Machine, badges, a weekly appreciation note, automatic shout-outs for the top staff performer, and an editable rewards list.
- **Team** — name, role, business tags, and contact, plus open and completed counts. Add or edit members.

Tags: Cell Phone Store (blue), Essentials – e-commerce (orange), Tax Accounting Office (green), Hustler Autos – car dealership (red), Telconnect.us – marketing agency (purple), Personal (gray).

## Sample data

The first visit seeds a working board: the named sample tasks, more open work across the businesses, about 30 days of check-ins, and completed history so the charts and streaks are populated. Dates are relative to the day you first open the app. **Reset sample data** in the sidebar (or the mobile header) rebuilds that seed for today and clears local edits.

## Stack

Vite, React, TypeScript, and Tailwind CSS.

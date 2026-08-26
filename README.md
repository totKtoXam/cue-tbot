# Cue

Cue is a configurable Telegram reminder and automation engine with a visual conditions builder. Product behavior is assembled from reusable entities rather than scenario-specific presets.

## Core concepts

- **Reminder Definition** — a one-time, recurring or ongoing trigger with Work Schedule, template, targeting, conditions and typed pause rules.
- **Reminder Run** — one recurrence-period execution with attempts, checklist state, pause/stop state and delivery history.
- **Work Schedule** — reusable built-in weekly schedule with multiple intervals per day, timezone and date exceptions.
- **Clients** — Telegram recipients.
- **Templates & aliases** — reusable messages using `{{client.name}}`, `{{deadline}}`, `{{remaining_count}}`, `{{reminder.name}}` and custom aliases.
- **Conditions Builder** — visual nested AND/OR groups with field/operator/value rules and workflow actions.
- **Checklist mode** — reminders target pending items only until everything is done, the allowed time ends or the run is stopped.

## Work Schedule

Cue does not require Google Calendar or another external calendar provider. The administration UI contains a calendar-style weekly editor. Drag across half-hour cells to define availability, for example:

- Monday–Friday `09:00–13:00` and `14:00–18:00`;
- Saturday/Sunday off;
- a specific holiday as a date exception;
- a special date with custom working intervals.

A Work Schedule is reusable and can be assigned to multiple reminders. Reminder trigger windows and Work Schedules are intentionally separate:

- trigger window answers **when Cue should evaluate a reminder**;
- Work Schedule answers **whether the current moment is allowed working time**;
- Conditions answer **whether actions should execute**.

Conditions expose:

- `schedule.isWorkingDay`
- `schedule.isWorkingTime`
- `schedule.currentTime`
- `schedule.weekday`
- `schedule.currentInterval`

## Runtime

Cue is implemented as a TypeScript/Hono worker with D1 persistence and Telegram webhook delivery.

Environment values:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
CRON_SECRET=
APP_TIMEZONE=Asia/Qyzylorda
```

Never commit real secrets.

### Endpoints

- `POST /api/telegram/webhook` — Telegram webhook.
- `POST /api/cron/tick` — authenticated scheduler tick.
- `GET/POST/PUT /api/work-schedules` — Work Schedule configuration.
- `GET /api/runs` and run/checklist actions — operational control.
- `/` — web administration interface.

## Local development

```bash
npm install
npm run db:local
npm run dev
```

## Scheduler

Cue uses an authenticated tick endpoint instead of an infinite background loop:

```http
POST /api/cron/tick
Authorization: Bearer <CRON_SECRET>
```

A one-minute cadence is a practical default. Each Reminder Definition decides whether it is actually due.

## Current MVP scope

The engine, adaptive reminder editor, visual Work Schedule editor, editable reminders/clients/messages, nested conditions builder, executable THEN/ELSE actions, Telegram-control renderer, delivery history, bot settings and manual run/checklist controls are implemented. The administration interface supports Russian and English, light and dark themes, searchable/filterable/paginated collections, guarded destructive actions and request loading states.

The hosted runtime still needs `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` and `CRON_SECRET` before Telegram delivery can run. An external scheduler must call `/api/cron/tick` on a regular cadence.

The current ChatGPT Sites deployment is owner-only. That is appropriate for the administration interface, but the same access policy also protects the webhook and scheduler routes. A production Telegram integration therefore needs a separate public integration worker (protected by the Telegram and cron secrets) or another explicitly approved route-level authentication design. Do not make the whole administration interface public as a shortcut.

Product-level extensions still include application roles for shared deployments and event-triggered reminders fed by external integrations.

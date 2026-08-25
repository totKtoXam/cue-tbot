# Cue

Cue is a configurable Telegram reminder and automation engine with a visual conditions builder. The weekly timesheet scenario is included as a preset, not hard-coded product behavior.

## Core concepts

- **Reminder Definition** — reusable schedule, template, targeting, conditions and pause rules.
- **Reminder Run** — one recurrence-period execution with attempts, checklist state, pause/stop state and delivery history.
- **Clients** — Telegram recipients with optional Google Calendar identity.
- **Templates & aliases** — reusable messages using `{{client.name}}`, `{{deadline}}`, `{{remaining_count}}`, `{{reminder.name}}` and custom aliases.
- **Conditions Builder** — visual nested AND/OR groups with field/operator/value rules and workflow actions.
- **Checklist mode** — reminders target pending items only, until everything is done, the time window ends, or the run is stopped.
- **Runs console** — manually pause/resume/stop a run and mark checklist items done/pending.

## Telegram controls

The template model stores inline callback buttons, URL buttons, reply-keyboard buttons, commands and request controls. Checklist notifications use an inline **Done** callback bound to the exact checklist item.

## Runtime

Cue is implemented as a TypeScript/Hono worker with D1 persistence. It is webhook-first and does not require Telegram long polling.

Required/optional secrets:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
CRON_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=
# Optional alternative for development/testing:
GOOGLE_CALENDAR_ACCESS_TOKEN=
APP_TIMEZONE=Asia/Qyzylorda
```

Never commit real values. For ChatGPT Sites, configure them as hosted environment secrets/values.

### Endpoints

- `POST /api/telegram/webhook` — Telegram webhook.
- `POST /api/cron/tick` — authenticated scheduler tick.
- `GET /api/runs` and run/checklist actions — operational control.
- `/` — web administration interface.

## Local development

```bash
npm install
npm run db:local
npm run dev
```

The committed `wrangler.jsonc` contains a placeholder D1 database id for direct Cloudflare deployment. A Sites deployment can bind its provisioned D1 database as `DB` via `.openai/hosting.json`.

## Scheduler

The scheduler is intentionally exposed as an authenticated tick endpoint instead of an infinite background loop:

```http
POST /api/cron/tick
Authorization: Bearer <CRON_SECRET>
```

A one-minute external cadence is a practical default. Cue evaluates each reminder schedule and only executes definitions that are due. Weekly runs use an ISO-week `period_key`, so a completed Friday run cannot become active again the next week.

## Google Calendar provider

Cue includes a Google Calendar provider with OAuth refresh-token support. Calendar context exposed to Conditions includes:

- `calendar.isWorkingDay`
- `calendar.isWorkingTime`
- `calendar.isBusy`

If OAuth/calendar settings are absent, Cue falls back to the configured working-day/time window instead of breaking reminder execution. This keeps the scheduler usable while Calendar integration is being configured.

## Visual Conditions Builder

A rule can contain nested `ALL (AND)` / `ANY (OR)` groups. Current sources include checklist counts/completion, Calendar state, current time, reminder attempt/priority, client tags and aliases. Operators include equality, numeric comparisons, contains/in, empty checks, date comparisons and between.

The editor provides both a readable preview and an Advanced JSON representation. A configured rule is attached to a Reminder Definition; users do not need to edit JSON directly.

## Timesheet preset

The preset creates:

- Friday 14:00–18:00 window;
- 30-minute retry interval;
- high priority;
- all currently active clients as targets;
- checklist mode;
- condition: pending count > 0 AND Calendar working time;
- notifications only to pending employees;
- a per-item **Done** Telegram callback;
- completion when all items are done, the period ends, or the run is manually stopped.

## Current MVP scope

The engine, web configuration UI, condition builder, Google Calendar provider, Telegram webhook, scheduler, manual run/checklist controls and timesheet preset are implemented. The next product-level extensions are richer Telegram-control configuration (multiple button rows/actions), per-client calendar evaluation in the same run, delivery analytics, authentication/roles for public deployments, and additional recurrence types beyond weekly schedules.

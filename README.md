# Cue

Cue is a configurable Telegram reminder and automation engine with a visual conditions builder. The weekly timesheet scenario is included as a preset, not hard-coded product behavior.

## Core concepts

- **Reminder Definition** — reusable schedule, template, targeting, conditions and pause rules.
- **Reminder Run** — one execution instance with attempts, checklist state, pause/stop state and delivery history.
- **Clients** — Telegram recipients with tags, custom fields, timezone and optional Calendar identity.
- **Templates & aliases** — reusable messages using `{{client.name}}`, `{{deadline}}`, `{{remaining_count}}` and custom aliases.
- **Conditions Builder** — nested AND/OR groups with field/operator/value rules and workflow actions.
- **Checklist mode** — reminder continues targeting pending checklist clients until all are done or the run stops.

## Telegram controls

The model supports inline callback buttons, URL buttons, reply keyboard buttons, commands and request buttons. The first preset uses an inline **Done** callback.

## Runtime

Cue is implemented as a TypeScript/Hono worker with a D1 relational database. It is webhook-first and does not require Telegram long polling.

Required secrets:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
CRON_SECRET=
GOOGLE_CALENDAR_API_KEY=
APP_TIMEZONE=Asia/Qyzylorda
```

Never commit the real values. For ChatGPT Sites, configure hosted environment values in Site settings.

### Endpoints

- `POST /api/telegram/webhook` — Telegram webhook.
- `POST /api/cron/tick` — protected scheduler tick. Call it periodically from a cron/scheduled-task provider because hosted web runtimes may not provide durable background processes.
- `/` — web administration interface.

## Local development

```bash
npm install
npm run db:local
npm run dev
```

The committed `wrangler.jsonc` contains a placeholder D1 database id. Replace it for a Cloudflare deployment; Sites can provision/bind its own D1 as `DB`.

## Scheduler

The scheduler is intentionally exposed as an authenticated tick endpoint rather than an in-process infinite loop. Send:

```http
POST /api/cron/tick
Authorization: Bearer <CRON_SECRET>
```

A one-minute cadence is a practical default. Each reminder definition decides whether it is actually due.

## Google Calendar provider

The schema already contains client `calendar_id`, and conditions expose `calendar.isWorkingDay` / `calendar.isWorkingTime`. The current MVP uses the default working-window evaluator. A production Calendar provider should resolve working hours, holidays, OOO and events before building the rule context. This separation keeps Calendar replaceable instead of coupling the reminder engine to Google-specific logic.

## Timesheet preset

The preset creates:

- Friday window 14:00–18:00;
- repeat every 30 minutes;
- high priority;
- checklist mode;
- condition: pending count > 0 AND calendar working time;
- sends only to pending checklist clients;
- stops when no pending items remain.

Add clients, associate them with the reminder target set, then run the scheduler tick.

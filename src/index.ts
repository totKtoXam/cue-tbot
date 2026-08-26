import { Hono } from 'hono';
import { z } from 'zod';
import { appHtml } from './ui';
import { Env, id, list, one } from './db';
import {
  renderTemplate,
  resolveRule,
  validateCondition,
  type EvaluationContext,
  type RuleAction,
  type RuleDefinition
} from './domain';
import { isPausedByRule, periodKey, scheduleDue, scheduleWindow, type ReminderSchedule } from './schedule';
import { defaultWorkSchedule, resolveWorkSchedule, type WorkScheduleDefinition } from './work-schedule';
import { renderTelegramControls, type TelegramControl } from './telegram-controls';

const app = new Hono<{ Bindings: Env }>();

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

app.get('/', (c) => c.html(appHtml));
app.get('/health', (c) => c.json({ ok: true, service: 'cue' }));

app.get('/api/runtime/status', (c) => c.json({
  telegramToken: Boolean(c.env.TELEGRAM_BOT_TOKEN),
  telegramWebhookSecret: Boolean(c.env.TELEGRAM_WEBHOOK_SECRET),
  cronSecret: Boolean(c.env.CRON_SECRET),
  timezone: c.env.APP_TIMEZONE ?? 'Asia/Qyzylorda'
}));

app.get('/api/dashboard', async (c) => {
  const reminders = await one<{ n: number }>(c.env.DB, 'SELECT COUNT(*) n FROM reminder_definitions WHERE enabled=1');
  const clients = await one<{ n: number }>(c.env.DB, 'SELECT COUNT(*) n FROM clients WHERE is_active=1');
  const pending = await one<{ n: number }>(c.env.DB, "SELECT COUNT(*) n FROM checklist_items WHERE status='pending'");
  const runs = await one<{ n: number }>(c.env.DB, "SELECT COUNT(*) n FROM reminder_runs WHERE status='active'");
  return c.json({ reminders: reminders?.n ?? 0, clients: clients?.n ?? 0, pending: pending?.n ?? 0, runs: runs?.n ?? 0 });
});

app.get('/api/reminders', async (c) => c.json(await list(c.env.DB, `
  SELECT rd.*, ws.name work_schedule_name, GROUP_CONCAT(rt.client_id) target_ids_csv
  FROM reminder_definitions rd
  LEFT JOIN work_schedules ws ON ws.id=rd.work_schedule_id
  LEFT JOIN reminder_targets rt ON rt.reminder_id=rd.id
  GROUP BY rd.id
  ORDER BY rd.created_at DESC
`)));
app.get('/api/templates', async (c) => c.json(await list(c.env.DB, 'SELECT * FROM message_templates ORDER BY name')));
app.get('/api/clients', async (c) => c.json(await list(c.env.DB, 'SELECT * FROM clients ORDER BY display_name')));
app.get('/api/aliases', async (c) => c.json(await list(c.env.DB, 'SELECT * FROM aliases ORDER BY key')));
app.get('/api/runs', async (c) => c.json(await list(c.env.DB, "SELECT rr.*,rd.name reminder_name FROM reminder_runs rr JOIN reminder_definitions rd ON rd.id=rr.reminder_id ORDER BY rr.started_at DESC LIMIT 50")));
app.get('/api/runs/:id/checklist', async (c) => c.json(await list(c.env.DB, 'SELECT ci.*,cl.display_name FROM checklist_items ci LEFT JOIN clients cl ON cl.id=ci.client_id WHERE ci.run_id=? ORDER BY ci.label', c.req.param('id'))));
app.get('/api/work-schedules', async (c) => c.json(await list(c.env.DB, 'SELECT * FROM work_schedules ORDER BY is_default DESC,name')));
app.get('/api/deliveries', async (c) => c.json(await list(c.env.DB, `
  SELECT dl.*, c.display_name, rd.name reminder_name
  FROM delivery_log dl
  LEFT JOIN clients c ON c.id=dl.client_id
  LEFT JOIN reminder_runs rr ON rr.id=dl.run_id
  LEFT JOIN reminder_definitions rd ON rd.id=rr.reminder_id
  ORDER BY dl.created_at DESC LIMIT 100
`)));

const commandSchema = z.object({ command: z.string().regex(/^[a-z0-9_]{1,32}$/), description: z.string().min(1).max(256) });
const botConfigSchema = z.object({
  name: z.string().min(1),
  username: z.string().optional(),
  default_parse_mode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).default('HTML'),
  timezone: z.string().min(1),
  commands: z.array(commandSchema).default([]),
  is_enabled: z.boolean().default(true)
});

app.get('/api/bot-config', async (c) => {
  const row = await one<any>(c.env.DB, 'SELECT * FROM bot_config ORDER BY created_at LIMIT 1');
  return c.json(row ?? {
    id: 'bot_default', name: 'Cue', username: '', default_parse_mode: 'HTML',
    timezone: c.env.APP_TIMEZONE ?? 'Asia/Qyzylorda', commands_json: '[]', is_enabled: 1
  });
});

app.put('/api/bot-config', async (c) => {
  const body = botConfigSchema.parse(await c.req.json());
  await c.env.DB.prepare(`
    INSERT INTO bot_config(id,name,username,default_parse_mode,timezone,commands_json,is_enabled)
    VALUES('bot_default',?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username,
      default_parse_mode=excluded.default_parse_mode,timezone=excluded.timezone,
      commands_json=excluded.commands_json,is_enabled=excluded.is_enabled,updated_at=CURRENT_TIMESTAMP
  `).bind(body.name, body.username || null, body.default_parse_mode, body.timezone, JSON.stringify(body.commands), body.is_enabled ? 1 : 0).run();
  return c.json({ ok: true });
});

const clientSchema = z.object({
  display_name: z.string().min(1),
  telegram_chat_id: z.string().min(1),
  telegram_user_id: z.string().optional(),
  timezone: z.string().optional(),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  is_active: z.boolean().default(true)
});

app.post('/api/clients', async (c) => {
  const body = clientSchema.parse(await c.req.json());
  const clientId = id('cli');
  await c.env.DB.prepare('INSERT INTO clients(id,display_name,telegram_chat_id,telegram_user_id,timezone,tags_json,custom_fields_json,is_active) VALUES(?,?,?,?,?,?,?,?)')
    .bind(clientId, body.display_name, body.telegram_chat_id, body.telegram_user_id || null, body.timezone || null, JSON.stringify(body.tags), JSON.stringify(body.customFields), body.is_active ? 1 : 0).run();
  return c.json({ ok: true, id: clientId }, 201);
});

app.put('/api/clients/:id', async (c) => {
  const body = clientSchema.parse(await c.req.json());
  await c.env.DB.prepare('UPDATE clients SET display_name=?,telegram_chat_id=?,telegram_user_id=?,timezone=?,tags_json=?,custom_fields_json=?,is_active=? WHERE id=?')
    .bind(body.display_name, body.telegram_chat_id, body.telegram_user_id || null, body.timezone || null, JSON.stringify(body.tags), JSON.stringify(body.customFields), body.is_active ? 1 : 0, c.req.param('id')).run();
  return c.json({ ok: true });
});

app.delete('/api/clients/:id', async (c) => {
  const clientId = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM reminder_targets WHERE client_id=?').bind(clientId),
    c.env.DB.prepare('UPDATE checklist_items SET client_id=NULL WHERE client_id=?').bind(clientId),
    c.env.DB.prepare('UPDATE delivery_log SET client_id=NULL WHERE client_id=?').bind(clientId),
    c.env.DB.prepare('DELETE FROM clients WHERE id=?').bind(clientId)
  ]);
  return c.json({ ok: true });
});

app.post('/api/aliases', async (c) => {
  const body = z.object({ key: z.string().regex(/^[A-Za-z0-9_.-]+$/), value: z.string() }).parse(await c.req.json());
  await c.env.DB.prepare('INSERT INTO aliases(id,key,value) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP')
    .bind(id('als'), body.key, body.value).run();
  return c.json({ ok: true }, 201);
});

app.delete('/api/aliases/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM aliases WHERE id=?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

const controlSchema = z.object({
  type: z.enum(['callback', 'url', 'reply', 'command', 'request_contact', 'request_location', 'web_app']),
  text: z.string().min(1), value: z.string().optional(), row: z.number().int().min(0).max(20).default(0)
});
const templateSchema = z.object({
  name: z.string().min(1), body: z.string().min(1),
  parse_mode: z.enum(['HTML', 'Markdown', 'MarkdownV2']).default('HTML'),
  controls: z.array(controlSchema).default([])
});

app.post('/api/templates', async (c) => {
  const body = templateSchema.parse(await c.req.json());
  const templateId = id('tpl');
  await c.env.DB.prepare('INSERT INTO message_templates(id,name,body,parse_mode,controls_json) VALUES(?,?,?,?,?)')
    .bind(templateId, body.name, body.body, body.parse_mode, JSON.stringify(body.controls)).run();
  return c.json({ ok: true, id: templateId }, 201);
});

app.put('/api/templates/:id', async (c) => {
  const body = templateSchema.parse(await c.req.json());
  await c.env.DB.prepare('UPDATE message_templates SET name=?,body=?,parse_mode=?,controls_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(body.name, body.body, body.parse_mode, JSON.stringify(body.controls), c.req.param('id')).run();
  return c.json({ ok: true });
});

app.delete('/api/templates/:id', async (c) => {
  const templateId = c.req.param('id');
  const usage = await one<{ n: number }>(c.env.DB, 'SELECT COUNT(*) n FROM reminder_definitions WHERE template_id=?', templateId);
  if ((usage?.n ?? 0) > 0) return c.json({ error: 'Message is used by a reminder. Change or delete that reminder first.' }, 409);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE delivery_log SET template_id=NULL WHERE template_id=?').bind(templateId),
    c.env.DB.prepare('DELETE FROM message_templates WHERE id=?').bind(templateId)
  ]);
  return c.json({ ok: true });
});

const intervalSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/)
}).refine((x) => x.start < x.end, 'Interval start must be before end.');
const workScheduleSchema = z.object({
  name: z.string().min(1), timezone: z.string().min(1),
  weekly: z.record(z.string(), z.array(intervalSchema)),
  exceptions: z.array(z.object({ date: z.string(), working: z.boolean(), intervals: z.array(intervalSchema).optional() })).default([]),
  isDefault: z.boolean().default(false)
});

app.post('/api/work-schedules', async (c) => {
  const body = workScheduleSchema.parse(await c.req.json());
  const scheduleId = id('ws');
  if (body.isDefault) await c.env.DB.prepare('UPDATE work_schedules SET is_default=0').run();
  await c.env.DB.prepare('INSERT INTO work_schedules(id,name,timezone,weekly_json,exceptions_json,is_default) VALUES(?,?,?,?,?,?)')
    .bind(scheduleId, body.name, body.timezone, JSON.stringify(body.weekly), JSON.stringify(body.exceptions), body.isDefault ? 1 : 0).run();
  return c.json({ ok: true, id: scheduleId }, 201);
});

app.put('/api/work-schedules/:id', async (c) => {
  const body = workScheduleSchema.parse(await c.req.json());
  if (body.isDefault) await c.env.DB.prepare('UPDATE work_schedules SET is_default=0').run();
  await c.env.DB.prepare('UPDATE work_schedules SET name=?,timezone=?,weekly_json=?,exceptions_json=?,is_default=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(body.name, body.timezone, JSON.stringify(body.weekly), JSON.stringify(body.exceptions), body.isDefault ? 1 : 0, c.req.param('id')).run();
  return c.json({ ok: true });
});

app.delete('/api/work-schedules/:id', async (c) => {
  const scheduleId = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE reminder_definitions SET work_schedule_id=NULL WHERE work_schedule_id=?').bind(scheduleId),
    c.env.DB.prepare('DELETE FROM work_schedules WHERE id=?').bind(scheduleId)
  ]);
  return c.json({ ok: true });
});

app.post('/api/work-schedules/seed-default', async (c) => {
  const existing = await one<{ id: string }>(c.env.DB, 'SELECT id FROM work_schedules WHERE is_default=1 LIMIT 1');
  if (existing) return c.json({ ok: true, id: existing.id });
  const schedule = defaultWorkSchedule(c.env.APP_TIMEZONE ?? 'Asia/Qyzylorda');
  const scheduleId = id('ws');
  await c.env.DB.prepare('INSERT INTO work_schedules(id,name,timezone,weekly_json,exceptions_json,is_default) VALUES(?,?,?,?,?,1)')
    .bind(scheduleId, 'Default work schedule', schedule.timezone, JSON.stringify(schedule.weekly), JSON.stringify(schedule.exceptions ?? [])).run();
  return c.json({ ok: true, id: scheduleId }, 201);
});

const reminderScheduleSchema = z.object({
  kind: z.enum(['weekly', 'once', 'recurring', 'ongoing']).default('recurring'),
  weekdays: z.array(z.string()).default([]),
  date: z.string().optional(),
  startTime: z.string().default('09:00'),
  stopTime: z.string().default('18:00'),
  allDay: z.boolean().default(false),
  repeatEveryMinutes: z.number().int().min(10),
  timezone: z.string().min(1)
}).superRefine((value, context) => {
  if (value.kind === 'once' && !value.date) context.addIssue({ code: 'custom', message: 'Date is required for a one-time reminder.' });
  if (value.kind === 'recurring' && value.weekdays.length === 0) context.addIssue({ code: 'custom', message: 'Choose at least one active weekday.' });
  if (!value.allDay && value.startTime > value.stopTime) context.addIssue({ code: 'custom', message: 'Start time must be before stop time.' });
});

const pauseRuleSchema = z.object({
  type: z.enum(['recurring', 'date', 'date_range']).default('recurring'),
  weekdays: z.array(z.string()).optional(),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  allDay: z.boolean().default(false),
  startTime: z.string().optional(),
  endTime: z.string().optional()
});

const reminderSchema = z.object({
  name: z.string().min(1), description: z.string().optional(), template_id: z.string().min(1),
  work_schedule_id: z.string().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  schedule: reminderScheduleSchema,
  pauseRules: z.array(pauseRuleSchema).default([]),
  checklistMode: z.boolean().default(false), targetIds: z.array(z.string()).default([]),
  conditionRule: z.unknown().optional().nullable(), enabled: z.boolean().default(true)
});

async function replaceTargets(db: D1Database, reminderId: string, targetIds: string[]) {
  const statements = [db.prepare('DELETE FROM reminder_targets WHERE reminder_id=?').bind(reminderId)];
  for (const clientId of targetIds) {
    statements.push(db.prepare('INSERT OR IGNORE INTO reminder_targets(reminder_id,client_id) VALUES(?,?)').bind(reminderId, clientId));
  }
  await db.batch(statements);
}

app.post('/api/reminders', async (c) => {
  const body = reminderSchema.parse(await c.req.json());
  const reminderId = id('rem');
  await c.env.DB.prepare('INSERT INTO reminder_definitions(id,name,description,template_id,work_schedule_id,priority,schedule_json,pause_rules_json,condition_rule_json,checklist_mode,enabled) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(reminderId, body.name, body.description || null, body.template_id, body.work_schedule_id ?? null, body.priority, JSON.stringify(body.schedule), JSON.stringify(body.pauseRules), body.conditionRule ? JSON.stringify(body.conditionRule) : null, body.checklistMode ? 1 : 0, body.enabled ? 1 : 0).run();
  await replaceTargets(c.env.DB, reminderId, body.targetIds);
  return c.json({ ok: true, id: reminderId }, 201);
});

app.put('/api/reminders/:id', async (c) => {
  const body = reminderSchema.parse(await c.req.json());
  const reminderId = c.req.param('id');
  await c.env.DB.prepare('UPDATE reminder_definitions SET name=?,description=?,template_id=?,work_schedule_id=?,priority=?,schedule_json=?,pause_rules_json=?,condition_rule_json=?,checklist_mode=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .bind(body.name, body.description || null, body.template_id, body.work_schedule_id ?? null, body.priority, JSON.stringify(body.schedule), JSON.stringify(body.pauseRules), body.conditionRule ? JSON.stringify(body.conditionRule) : null, body.checklistMode ? 1 : 0, body.enabled ? 1 : 0, reminderId).run();
  await replaceTargets(c.env.DB, reminderId, body.targetIds);
  return c.json({ ok: true });
});

app.delete('/api/reminders/:id', async (c) => {
  const reminderId = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM delivery_log WHERE run_id IN (SELECT id FROM reminder_runs WHERE reminder_id=?)').bind(reminderId),
    c.env.DB.prepare('DELETE FROM checklist_items WHERE run_id IN (SELECT id FROM reminder_runs WHERE reminder_id=?)').bind(reminderId),
    c.env.DB.prepare('DELETE FROM reminder_runs WHERE reminder_id=?').bind(reminderId),
    c.env.DB.prepare('DELETE FROM reminder_targets WHERE reminder_id=?').bind(reminderId),
    c.env.DB.prepare('DELETE FROM reminder_definitions WHERE id=?').bind(reminderId)
  ]);
  return c.json({ ok: true });
});

app.post('/api/rules/validate', async (c) => {
  const rule = await c.req.json<RuleDefinition>();
  const errors = validateCondition(rule.condition);
  return c.json({ valid: errors.length === 0, errors });
});

async function completeRunIfDone(db: D1Database, runId: string) {
  const count = await one<{ n: number }>(db, "SELECT COUNT(*) n FROM checklist_items WHERE run_id=? AND status='pending'", runId);
  if ((count?.n ?? 0) === 0) {
    await db.prepare("UPDATE reminder_runs SET status='completed',stopped_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'").bind(runId).run();
  }
}

app.post('/api/runs/:id/pause', async (c) => {
  const body = z.object({ until: z.string().datetime() }).parse(await c.req.json());
  await c.env.DB.prepare("UPDATE reminder_runs SET pause_until=? WHERE id=? AND status='active'").bind(body.until, c.req.param('id')).run();
  return c.json({ ok: true });
});
app.post('/api/runs/:id/resume', async (c) => {
  await c.env.DB.prepare("UPDATE reminder_runs SET pause_until=NULL WHERE id=? AND status='active'").bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
app.post('/api/runs/:id/stop', async (c) => {
  await c.env.DB.prepare("UPDATE reminder_runs SET status='stopped',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
app.delete('/api/runs/:id', async (c) => {
  const runId = c.req.param('id');
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM delivery_log WHERE run_id=?').bind(runId),
    c.env.DB.prepare('DELETE FROM checklist_items WHERE run_id=?').bind(runId),
    c.env.DB.prepare('DELETE FROM reminder_runs WHERE id=?').bind(runId)
  ]);
  return c.json({ ok: true });
});
app.delete('/api/deliveries/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM delivery_log WHERE id=?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});
app.post('/api/checklist/:id/toggle', async (c) => {
  const item = await one<{ status: string; run_id: string }>(c.env.DB, 'SELECT status,run_id FROM checklist_items WHERE id=?', c.req.param('id'));
  if (!item) return c.json({ error: 'not found' }, 404);
  const next = item.status === 'done' ? 'pending' : 'done';
  await c.env.DB.prepare("UPDATE checklist_items SET status=?,completed_at=CASE WHEN ?='done' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?")
    .bind(next, next, c.req.param('id')).run();
  if (next === 'done') await completeRunIfDone(c.env.DB, item.run_id);
  return c.json({ ok: true, status: next });
});

async function telegram(env: Env, method: string, payload: unknown) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json<any>();
  if (!data.ok) throw new Error(data.description ?? 'Telegram API error');
  return data.result;
}

app.post('/api/bot-config/sync-commands', async (c) => {
  const config = await one<any>(c.env.DB, 'SELECT commands_json FROM bot_config ORDER BY created_at LIMIT 1');
  const commands = parseJson(config?.commands_json, []);
  await telegram(c.env, 'setMyCommands', { commands });
  return c.json({ ok: true });
});

app.post('/api/telegram/webhook', async (c) => {
  if (!c.env.TELEGRAM_WEBHOOK_SECRET) return c.json({ error: 'webhook is not configured' }, 503);
  if (c.req.header('x-telegram-bot-api-secret-token') !== c.env.TELEGRAM_WEBHOOK_SECRET) return c.json({ error: 'unauthorized' }, 401);
  const update = await c.req.json<any>();
  const callbackData = String(update.callback_query?.data ?? '');
  if (callbackData.startsWith('checklist:done:')) {
    const checklistId = callbackData.slice('checklist:done:'.length);
    const item = await one<{ id: string; status: string; run_id: string }>(c.env.DB, 'SELECT id,status,run_id FROM checklist_items WHERE id=?', checklistId);
    if (item?.status === 'pending') {
      await c.env.DB.prepare("UPDATE checklist_items SET status='done',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(item.id).run();
      await completeRunIfDone(c.env.DB, item.run_id);
    }
    await telegram(c.env, 'answerCallbackQuery', {
      callback_query_id: update.callback_query.id,
      text: item ? (item.status === 'pending' ? 'Marked done' : 'Already done') : 'Checklist item not found'
    });
  }
  return c.json({ ok: true });
});

async function recipientsForRun(db: D1Database, reminderId: string, runId: string, checklistMode: boolean) {
  if (checklistMode) return await list<any>(db, "SELECT c.*,ci.id checklist_item_id FROM checklist_items ci JOIN clients c ON c.id=ci.client_id WHERE ci.run_id=? AND ci.status='pending'", runId);
  return await list<any>(db, 'SELECT c.*,NULL checklist_item_id FROM reminder_targets rt JOIN clients c ON c.id=rt.client_id WHERE rt.reminder_id=? AND c.is_active=1', reminderId);
}

async function loadWorkSchedule(db: D1Database, workScheduleId: string | null | undefined, timezone: string): Promise<WorkScheduleDefinition> {
  const row = workScheduleId
    ? await one<any>(db, 'SELECT * FROM work_schedules WHERE id=?', workScheduleId)
    : await one<any>(db, 'SELECT * FROM work_schedules WHERE is_default=1 LIMIT 1');
  if (!row) return defaultWorkSchedule(timezone);
  return { timezone: row.timezone, weekly: parseJson(row.weekly_json, {}), exceptions: parseJson(row.exceptions_json, []) };
}

function clientContext(client: any, aliases: Record<string, string>): EvaluationContext {
  const custom = parseJson<Record<string, unknown>>(client.custom_fields_json, {});
  const context: EvaluationContext = {
    'client.name': client.display_name,
    'client.tags': parseJson(client.tags_json, []),
    'client.timezone': client.timezone ?? ''
  };
  for (const [key, value] of Object.entries(custom)) context[`client.${key}`] = value;
  for (const [key, value] of Object.entries(aliases)) context[`alias.${key}`] = value;
  return context;
}

function safeWebhookUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value ?? ''));
    const blocked = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname);
    return url.protocol === 'https:' && !blocked ? url : null;
  } catch { return null; }
}

async function applyActions(
  env: Env,
  run: any,
  actions: RuleAction[],
  context: EvaluationContext,
  defaultPriority: string
): Promise<{ send: boolean; halt: boolean; priority: string }> {
  let send = false;
  let halt = false;
  let priority = defaultPriority;
  for (const action of actions) {
    if (action.type === 'send_message') send = true;
    if (action.type === 'skip') send = false;
    if (action.type === 'change_priority') {
      const next = String(action.config?.priority ?? '');
      if (['low', 'normal', 'high', 'critical'].includes(next)) priority = next;
    }
    if (action.type === 'pause_run') {
      const minutes = Math.max(1, Math.min(10080, Number(action.config?.minutes ?? 60)));
      const until = new Date(Date.now() + minutes * 60_000).toISOString();
      await env.DB.prepare("UPDATE reminder_runs SET pause_until=? WHERE id=? AND status='active'").bind(until, run.id).run();
      send = false;
      halt = true;
    }
    if (action.type === 'stop_run') {
      await env.DB.prepare("UPDATE reminder_runs SET status='stopped',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(run.id).run();
      send = false;
      halt = true;
    }
    if (action.type === 'mark_done') {
      const checklistItemId = String(action.config?.checklistItemId ?? '');
      if (checklistItemId) await env.DB.prepare("UPDATE checklist_items SET status='done',completed_at=CURRENT_TIMESTAMP WHERE id=? AND run_id=?").bind(checklistItemId, run.id).run();
    }
    if (action.type === 'webhook') {
      const url = safeWebhookUrl(action.config?.url);
      if (url) await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runId: run.id, context }) });
    }
  }
  return { send, halt, priority };
}

app.post('/api/cron/tick', async (c) => {
  if (!c.env.CRON_SECRET) return c.json({ error: 'scheduler is not configured' }, 503);
  if (c.req.header('authorization') !== `Bearer ${c.env.CRON_SECRET}`) return c.json({ error: 'unauthorized' }, 401);

  const definitions = await list<any>(c.env.DB, 'SELECT * FROM reminder_definitions WHERE enabled=1');
  const now = new Date();
  let sent = 0;

  for (const definition of definitions) {
    const schedule = parseJson<ReminderSchedule>(definition.schedule_json, { weekdays: [], startTime: '00:00', stopTime: '00:00', repeatEveryMinutes: 60, timezone: 'UTC' });
    const currentPeriod = periodKey(schedule, now);
    await c.env.DB.prepare("UPDATE reminder_runs SET status='completed',stopped_at=CURRENT_TIMESTAMP WHERE reminder_id=? AND status='active' AND period_key<>?")
      .bind(definition.id, currentPeriod).run();

    const window = scheduleWindow(schedule, now);
    let run = await one<any>(c.env.DB, 'SELECT * FROM reminder_runs WHERE reminder_id=? AND period_key=? LIMIT 1', definition.id, currentPeriod);
    if (run?.status === 'active' && window === 'after') {
      await c.env.DB.prepare("UPDATE reminder_runs SET status='completed',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(run.id).run();
      continue;
    }
    const pauseRules = parseJson<any[]>(definition.pause_rules_json, []);
    if (window !== 'active' || isPausedByRule(pauseRules, now, schedule.timezone ?? 'UTC')) continue;

    const workSchedule = await loadWorkSchedule(c.env.DB, definition.work_schedule_id, schedule.timezone ?? c.env.APP_TIMEZONE ?? 'UTC');
    const work = resolveWorkSchedule(workSchedule, now);
    if (!run) {
      const runId = id('run');
      await c.env.DB.prepare('INSERT INTO reminder_runs(id,reminder_id,period_key,next_execution_at) VALUES(?,?,?,CURRENT_TIMESTAMP)').bind(runId, definition.id, currentPeriod).run();
      run = await one<any>(c.env.DB, 'SELECT * FROM reminder_runs WHERE id=?', runId);
      if (bool(definition.checklist_mode)) {
        const targets = await list<any>(c.env.DB, 'SELECT c.* FROM reminder_targets rt JOIN clients c ON c.id=rt.client_id WHERE rt.reminder_id=? AND c.is_active=1', definition.id);
        for (const target of targets) {
          await c.env.DB.prepare('INSERT INTO checklist_items(id,run_id,client_id,label) VALUES(?,?,?,?)').bind(id('chk'), runId, target.id, target.display_name).run();
        }
      }
    }
    if (!run || run.status !== 'active' || (run.pause_until && new Date(run.pause_until) > now)) continue;
    if (!work.isWorkingDay || work.isFinished) {
      await c.env.DB.prepare("UPDATE reminder_runs SET status='completed',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(run.id).run();
      continue;
    }
    if (!work.isWorkingTime || !scheduleDue(schedule, now, run.last_executed_at)) continue;

    const counts = await one<any>(c.env.DB, "SELECT COUNT(*) total,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done FROM checklist_items WHERE run_id=?", run.id);
    const recipients = await recipientsForRun(c.env.DB, definition.id, run.id, bool(definition.checklist_mode));
    if (bool(definition.checklist_mode) && recipients.length === 0) {
      await c.env.DB.prepare("UPDATE reminder_runs SET status='completed',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(run.id).run();
      continue;
    }
    const template = await one<any>(c.env.DB, 'SELECT * FROM message_templates WHERE id=?', definition.template_id);
    if (!template) continue;

    const aliasRows = await list<{ key: string; value: string }>(c.env.DB, 'SELECT key,value FROM aliases');
    const aliases = Object.fromEntries(aliasRows.map((alias) => [alias.key, alias.value]));
    const controls = parseJson<TelegramControl[]>(template.controls_json, []);
    const rule = definition.condition_rule_json ? parseJson<RuleDefinition | null>(definition.condition_rule_json, null) : null;
    const baseContext: EvaluationContext = {
      'checklist.pendingCount': bool(definition.checklist_mode) ? (counts?.pending ?? 0) : recipients.length,
      'checklist.doneCount': counts?.done ?? 0,
      'checklist.completionPercent': counts?.total ? Math.round(((counts.done ?? 0) / counts.total) * 100) : 0,
      'schedule.isWorkingDay': work.isWorkingDay,
      'schedule.isWorkingTime': work.isWorkingTime,
      'schedule.currentTime': work.currentTime,
      'schedule.weekday': work.weekday,
      'schedule.currentInterval': work.currentInterval ? `${work.currentInterval.start}-${work.currentInterval.end}` : '',
      'system.currentTime': work.currentTime,
      'reminder.attempt': run.attempt,
      'reminder.priority': definition.priority
    };

    for (const client of recipients) {
      const context = { ...baseContext, ...clientContext(client, aliases) };
      const resolved = resolveRule(rule, context);
      const actionResult = await applyActions(c.env, run, resolved.actions, context, definition.priority);
      if (actionResult.halt) break;
      if (!actionResult.send) continue;

      const values = {
        ...aliases,
        'client.name': client.display_name,
        'remaining_count': recipients.length,
        deadline: work.currentInterval?.end ?? schedule.stopTime,
        'reminder.name': definition.name,
        'reminder.priority': actionResult.priority,
        checklist_item_id: client.checklist_item_id ?? ''
      };
      const message = renderTemplate(template.body, values);
      const replyMarkup = renderTelegramControls(controls, values, client.checklist_item_id ?? undefined);
      try {
        const result = await telegram(c.env, 'sendMessage', {
          chat_id: client.telegram_chat_id,
          text: message,
          parse_mode: template.parse_mode,
          ...(replyMarkup ? { reply_markup: replyMarkup } : {})
        });
        await c.env.DB.prepare('INSERT INTO delivery_log(id,run_id,client_id,telegram_chat_id,template_id,rendered_message,status,telegram_message_id) VALUES(?,?,?,?,?,?,?,?)')
          .bind(id('log'), run.id, client.id, client.telegram_chat_id, template.id, message, 'sent', String(result.message_id)).run();
        sent++;
      } catch (error) {
        await c.env.DB.prepare('INSERT INTO delivery_log(id,run_id,client_id,telegram_chat_id,template_id,rendered_message,status,error) VALUES(?,?,?,?,?,?,?,?)')
          .bind(id('log'), run.id, client.id, client.telegram_chat_id, template.id, message, 'failed', String(error)).run();
      }
    }
    const nextExecution = new Date(now.getTime() + schedule.repeatEveryMinutes * 60_000).toISOString();
    if (schedule.kind === 'once' && !bool(definition.checklist_mode)) {
      await c.env.DB.prepare("UPDATE reminder_runs SET attempt=attempt+1,last_executed_at=CURRENT_TIMESTAMP,next_execution_at=NULL,status='completed',stopped_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'")
        .bind(run.id).run();
    } else {
      await c.env.DB.prepare('UPDATE reminder_runs SET attempt=attempt+1,last_executed_at=CURRENT_TIMESTAMP,next_execution_at=? WHERE id=? AND status=?')
        .bind(nextExecution, run.id, 'active').run();
    }
  }
  return c.json({ ok: true, sent });
});

app.onError((error, c) => {
  console.error(error);
  return c.json({ error: error instanceof Error ? error.message : 'Internal error' }, 500);
});

export default app;

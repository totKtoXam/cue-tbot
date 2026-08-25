PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS bot_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT,
  default_parse_mode TEXT NOT NULL DEFAULT 'HTML',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  working_start TEXT NOT NULL DEFAULT '09:00',
  working_end TEXT NOT NULL DEFAULT '18:00',
  working_days_json TEXT NOT NULL DEFAULT '["mon","tue","wed","thu","fri"]',
  commands_json TEXT NOT NULL DEFAULT '[]',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  telegram_chat_id TEXT NOT NULL,
  telegram_user_id TEXT,
  timezone TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  custom_fields_json TEXT NOT NULL DEFAULT '{}',
  calendar_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS aliases (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  parse_mode TEXT NOT NULL DEFAULT 'HTML',
  controls_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reminder_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_id TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  schedule_json TEXT NOT NULL,
  pause_rules_json TEXT NOT NULL DEFAULT '[]',
  condition_rule_json TEXT,
  checklist_mode INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(template_id) REFERENCES message_templates(id)
);

CREATE TABLE IF NOT EXISTS reminder_targets (
  reminder_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  PRIMARY KEY(reminder_id, client_id),
  FOREIGN KEY(reminder_id) REFERENCES reminder_definitions(id) ON DELETE CASCADE,
  FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reminder_runs (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  attempt INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_executed_at TEXT,
  next_execution_at TEXT,
  stopped_at TEXT,
  pause_until TEXT,
  context_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(reminder_id) REFERENCES reminder_definitions(id),
  UNIQUE(reminder_id, period_key)
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  client_id TEXT,
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(run_id) REFERENCES reminder_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(client_id) REFERENCES clients(id)
);

CREATE TABLE IF NOT EXISTS delivery_log (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  client_id TEXT,
  telegram_chat_id TEXT NOT NULL,
  template_id TEXT,
  rendered_message TEXT NOT NULL,
  status TEXT NOT NULL,
  telegram_message_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);
CREATE INDEX IF NOT EXISTS idx_reminder_runs_status ON reminder_runs(status);
CREATE INDEX IF NOT EXISTS idx_checklist_items_run_status ON checklist_items(run_id, status);
CREATE INDEX IF NOT EXISTS idx_delivery_log_run_created ON delivery_log(run_id, created_at);
PRAGMA optimize;

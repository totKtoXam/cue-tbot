import { uiCss } from './ui-css';
import { uiScript } from './ui-script';

export const appHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Cue — configurable Telegram reminders, schedules and checklists.">
  <title>Cue</title>
  <style>${uiCss}</style>
</head>
<body>
<div class="app">
  <aside class="sidebar" id="sidebar">
    <div class="brand"><span class="brand-mark">C</span><span class="brand-copy">Cue<small>Reminder builder</small></span></div>
    <div class="nav-label">Workspace</div>
    <button class="nav-item active" data-view="dashboard" data-title="Dashboard"><span class="nav-icon">⌂</span>Dashboard</button>
    <button class="nav-item" data-view="reminders" data-title="Reminders"><span class="nav-icon">◉</span>Reminders</button>
    <button class="nav-item" data-view="runs" data-title="Runs & checklist"><span class="nav-icon">▷</span>Runs & checklist</button>
    <button class="nav-item" data-view="clients" data-title="Clients"><span class="nav-icon">◎</span>Clients</button>
    <button class="nav-item" data-view="messages" data-title="Messages"><span class="nav-icon">▤</span>Messages</button>
    <button class="nav-item" data-view="aliases" data-title="Aliases"><span class="nav-icon">{ }</span>Aliases</button>
    <div class="nav-label">Automation</div>
    <button class="nav-item" data-view="conditions" data-title="Conditions"><span class="nav-icon">◇</span>Conditions</button>
    <button class="nav-item" data-view="work" data-title="Work schedules"><span class="nav-icon">◷</span>Work schedules</button>
    <button class="nav-item" data-view="deliveries" data-title="Deliveries"><span class="nav-icon">↗</span>Deliveries</button>
    <div class="nav-label">System</div>
    <button class="nav-item" data-view="settings" data-title="Settings"><span class="nav-icon">⚙︎</span>Settings</button>
  </aside>

  <div class="content">
    <header class="topbar">
      <div class="actions"><button class="mobile-menu" id="mobileMenu" aria-label="Open menu">☰</button><span class="crumb">Cue / <b id="currentTitle">Dashboard</b></span></div>
      <div class="top-status"><span class="status-dot" id="topStatusDot"></span><span id="topStatusText">Checking runtime</span></div>
    </header>

    <main class="main">
      <section class="view" id="dashboard">
        <div class="page-head">
          <div><h1 class="page-title">Dashboard</h1><p class="page-description">Configure Telegram reminders, review active runs and keep pending work moving.</p></div>
          <button class="btn primary" id="timesheetPreset"><span>＋</span>Create timesheet preset</button>
        </div>
        <div class="grid stats">
          <div class="card"><div class="stat-label">Active reminders</div><div class="stat-value" id="statReminders">—</div><div class="stat-foot">Enabled definitions</div></div>
          <div class="card"><div class="stat-label">Active clients</div><div class="stat-value" id="statClients">—</div><div class="stat-foot">Telegram recipients</div></div>
          <div class="card"><div class="stat-label">Pending checklist</div><div class="stat-value" id="statPending">—</div><div class="stat-foot">Items still open</div></div>
          <div class="card"><div class="stat-label">Active runs</div><div class="stat-value" id="statRuns">—</div><div class="stat-foot">Current periods</div></div>
        </div>
        <div class="grid two" style="margin-top:14px">
          <div class="card">
            <div class="section-head"><div><h2>Runtime readiness</h2><p class="card-subtitle">Hosted configuration required for delivery.</p></div></div>
            <div class="readiness" id="runtimeReadiness"></div>
          </div>
          <div class="card">
            <div class="section-head"><div><h2>Quick setup</h2><p class="card-subtitle">The shortest path to a working reminder.</p></div></div>
            <div class="quick-list">
              <div class="quick-step"><span class="step-number">1</span><div><b>Add clients</b><span>Recipients and Telegram chat IDs</span></div></div>
              <div class="quick-step"><span class="step-number">2</span><div><b>Create a message</b><span>Template, aliases and Telegram controls</span></div></div>
              <div class="quick-step"><span class="step-number">3</span><div><b>Configure a reminder</b><span>Window, schedule, checklist and conditions</span></div></div>
            </div>
          </div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="section-head"><div><h2>Recent runs</h2><p class="card-subtitle">Latest workflow periods and their state.</p></div><button class="btn small ghost" data-go="runs">View all</button></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Reminder</th><th>Period</th><th>Status</th><th>Attempt</th></tr></thead><tbody id="dashboardRuns"></tbody></table></div>
        </div>
      </section>

      <section class="view hidden" id="reminders">
        <div class="page-head"><div><h1 class="page-title">Reminders</h1><p class="page-description">Trigger window, recipients, Work Schedule, pause rules and visual conditions in one reusable definition.</p></div><button class="btn primary" id="newReminder">＋ New reminder</button></div>
        <div class="card" id="reminderEditor">
          <div class="section-head"><div><h2 id="remEditorTitle">New reminder</h2><p class="card-subtitle">Weekly schedule is the current recurrence type.</p></div></div>
          <div class="inline-fields">
            <div class="field"><label>Name</label><input id="remName" placeholder="Weekly timesheet"></div>
            <div class="field"><label>Priority</label><select id="remPriority"><option>low</option><option selected>normal</option><option>high</option><option>critical</option></select></div>
          </div>
          <div class="field"><label>Description</label><textarea id="remDescription" placeholder="What this reminder is responsible for"></textarea></div>
          <div class="inline-fields">
            <div class="field"><label>Message</label><select id="remTemplate"></select></div>
            <div class="field"><label>Work schedule</label><select id="remWork"></select></div>
          </div>
          <div class="field"><label>Active weekdays</label><div class="day-checks" id="remDays"></div></div>
          <div class="inline-fields four">
            <div class="field"><label>Start</label><input id="remStart" type="time" value="14:00"></div>
            <div class="field"><label>Stop</label><input id="remStop" type="time" value="18:00"></div>
            <div class="field"><label>Repeat, min</label><input id="remRepeat" type="number" min="1" value="30"></div>
            <div class="field"><label>Timezone</label><input id="remTimezone" value="Asia/Qyzylorda"></div>
          </div>
          <div class="field"><label>Recipients</label><div class="target-list" id="remTargets"></div></div>
          <div class="section-head"><div><h2>Recurring pauses</h2><p class="card-subtitle">Quiet intervals inside the trigger window.</p></div><button class="btn small" id="addPauseRule">＋ Add pause</button></div>
          <div class="list-editor" id="pauseRules"></div>
          <div class="actions" style="margin-top:16px">
            <label class="checkline"><input type="checkbox" id="remChecklist">Checklist mode</label>
            <label class="checkline"><input type="checkbox" id="remUseRule" checked>Use current condition rule</label>
            <label class="checkline"><input type="checkbox" id="remEnabled" checked>Enabled</label>
          </div>
          <div class="form-actions"><button class="btn ghost" id="cancelReminder">Reset</button><button class="btn primary" id="saveReminder">Save reminder</button></div>
        </div>
        <div class="card">
          <div class="section-head"><div><h2>Saved reminders</h2><p class="card-subtitle">Open a definition to update any setting.</p></div></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Priority</th><th>Schedule</th><th>Checklist</th><th>Status</th><th></th></tr></thead><tbody id="reminderRows"></tbody></table></div>
        </div>
      </section>

      <section class="view hidden" id="runs">
        <div class="page-head"><div><h1 class="page-title">Runs & checklist</h1><p class="page-description">Operational state for each recurrence period. Pause, resume, stop or complete individual checklist items.</p></div><button class="btn" id="refreshRuns">↻ Refresh</button></div>
        <div class="grid" id="runCards"></div>
      </section>

      <section class="view hidden" id="clients">
        <div class="page-head"><div><h1 class="page-title">Clients</h1><p class="page-description">Telegram recipients with timezone, tags and custom fields for conditions.</p></div><button class="btn primary" id="newClient">＋ New client</button></div>
        <div class="card">
          <div class="section-head"><div><h2 id="clientEditorTitle">New client</h2><p class="card-subtitle">Chat ID is required for Telegram delivery.</p></div></div>
          <div class="inline-fields">
            <div class="field"><label>Display name</label><input id="clientName" placeholder="Ada Lovelace"></div>
            <div class="field"><label>Telegram chat ID</label><input id="clientChat" placeholder="123456789"></div>
          </div>
          <div class="inline-fields three">
            <div class="field"><label>Telegram user ID</label><input id="clientUser" placeholder="Optional"></div>
            <div class="field"><label>Timezone</label><input id="clientTimezone" placeholder="Asia/Qyzylorda"></div>
            <div class="field"><label>Tags</label><input id="clientTags" placeholder="team-a, manager"></div>
          </div>
          <div class="field"><label>Custom fields</label><textarea id="clientCustom" placeholder='{"department":"Engineering"}'></textarea><span class="field-hint">Optional key/value object used by conditions.</span></div>
          <label class="checkline"><input type="checkbox" id="clientActive" checked>Active recipient</label>
          <div class="form-actions"><button class="btn ghost" id="cancelClient">Reset</button><button class="btn primary" id="saveClient">Save client</button></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Chat ID</th><th>Timezone</th><th>Tags</th><th>Status</th><th></th></tr></thead><tbody id="clientRows"></tbody></table></div></div>
      </section>

      <section class="view hidden" id="messages">
        <div class="page-head"><div><h1 class="page-title">Messages</h1><p class="page-description">Reusable Telegram templates with aliases, inline buttons, reply keyboards and request controls.</p></div><button class="btn primary" id="newTemplate">＋ New message</button></div>
        <div class="grid two">
          <div class="card">
            <div class="section-head"><div><h2 id="templateEditorTitle">New message</h2><p class="card-subtitle">Use placeholders such as {{client.name}} and {{deadline}}.</p></div></div>
            <div class="inline-fields">
              <div class="field"><label>Name</label><input id="templateName" placeholder="Reminder"></div>
              <div class="field"><label>Parse mode</label><select id="templateParse"><option>HTML</option><option>Markdown</option><option>MarkdownV2</option></select></div>
            </div>
            <div class="field"><label>Message text</label><textarea id="templateBody" style="min-height:190px">Hi {{client.name}}!\n\nPlease complete the task before {{deadline}}.\nRemaining: {{remaining_count}}.</textarea></div>
            <div class="section-head"><div><h2>Telegram controls</h2><p class="card-subtitle">Rows and ordering are preserved.</p></div><button class="btn small" id="addControl">＋ Add control</button></div>
            <div class="list-editor" id="controlRows"></div>
            <div class="form-actions"><button class="btn ghost" id="cancelTemplate">Reset</button><button class="btn primary" id="saveTemplate">Save message</button></div>
          </div>
          <div>
            <div class="card"><div class="section-head"><div><h2>Preview</h2><p class="card-subtitle">Example values are used for placeholders.</p></div></div><div class="preview" id="messagePreview"></div></div>
            <div class="card"><div class="section-head"><div><h2>Saved messages</h2></div></div><div id="templateList"></div></div>
          </div>
        </div>
      </section>

      <section class="view hidden" id="aliases">
        <div class="page-head"><div><h1 class="page-title">Aliases</h1><p class="page-description">Global reusable values available as {{alias_name}} in every message.</p></div></div>
        <div class="card">
          <div class="inline-fields"><div class="field"><label>Alias</label><input id="aliasKey" placeholder="company_name"></div><div class="field"><label>Value</label><input id="aliasValue" placeholder="Acme"></div></div>
          <div class="form-actions"><button class="btn primary" id="saveAlias">Save alias</button></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Placeholder</th><th>Value</th><th></th></tr></thead><tbody id="aliasRows"></tbody></table></div></div>
      </section>

      <section class="view hidden" id="conditions">
        <div class="page-head"><div><h1 class="page-title">Conditions</h1><p class="page-description">Build nested ALL/ANY rules and configure multiple THEN/ELSE actions without editing JSON.</p></div><div class="actions"><button class="btn" id="addRootCondition">＋ Condition</button><button class="btn" id="addRootGroup">＋ Group</button></div></div>
        <div class="grid two">
          <div class="card">
            <div class="section-head"><div><h2>WHEN</h2><p class="card-subtitle">Conditions can be nested up to eight levels.</p></div></div>
            <div class="rule-tree" id="conditionTree"></div>
            <div class="divider"></div>
            <div class="section-head"><div><h2>THEN</h2></div><button class="btn small" data-add-action="then">＋ Action</button></div>
            <div class="list-editor" id="thenActions"></div>
            <div class="divider"></div>
            <div class="section-head"><div><h2>ELSE</h2></div><button class="btn small" data-add-action="else">＋ Action</button></div>
            <div class="list-editor" id="elseActions"></div>
            <div class="form-actions"><span class="muted" id="conditionValidity"></span><button class="btn primary" id="validateCondition">Validate rule</button></div>
          </div>
          <div class="card">
            <div class="tabs"><button class="tab active" data-condition-tab="readable">Readable</button><button class="tab" data-condition-tab="json">JSON preview</button></div>
            <pre class="preview" id="conditionReadable"></pre><pre class="preview hidden" id="conditionJson"></pre>
          </div>
        </div>
      </section>

      <section class="view hidden" id="work">
        <div class="page-head"><div><h1 class="page-title">Work schedules</h1><p class="page-description">Reusable weekly availability with half-hour precision, split intervals and date exceptions.</p></div><button class="btn primary" id="newWork">＋ New schedule</button></div>
        <div class="card">
          <div class="section-head"><div><h2 id="workEditorTitle">New schedule</h2><p class="card-subtitle">Drag across cells to add or remove working time.</p></div></div>
          <div class="inline-fields"><div class="field"><label>Name</label><input id="workName" value="Default work schedule"></div><div class="field"><label>Timezone</label><input id="workTimezone" value="Asia/Qyzylorda"></div></div>
          <label class="checkline"><input type="checkbox" id="workDefault">Default schedule</label>
          <div class="divider"></div>
          <div class="schedule-toolbar">
            <select id="copyFrom"></select><span class="muted" style="align-self:center">to</span><select id="copyTo"></select><button class="btn small" id="copyDay">Copy day</button>
            <select id="clearDay"></select><button class="btn small" id="clearSelectedDay">Clear day</button>
          </div>
          <div class="schedule-scroll"><div class="week-grid" id="weekGrid"></div></div>
          <div class="divider"></div>
          <div class="section-head"><div><h2>Date exceptions</h2><p class="card-subtitle">Holidays and special working days.</p></div><button class="btn small" id="addException">＋ Exception</button></div>
          <div id="exceptionRows"></div>
          <div class="form-actions"><button class="btn ghost" id="cancelWork">Reset</button><button class="btn primary" id="saveWork">Save schedule</button></div>
        </div>
        <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Timezone</th><th>Default</th><th></th></tr></thead><tbody id="workRows"></tbody></table></div></div>
      </section>

      <section class="view hidden" id="deliveries">
        <div class="page-head"><div><h1 class="page-title">Deliveries</h1><p class="page-description">Recent Telegram sends, failures and rendered messages.</p></div><button class="btn" id="refreshDeliveries">↻ Refresh</button></div>
        <div class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Reminder</th><th>Client</th><th>Status</th><th>Message</th></tr></thead><tbody id="deliveryRows"></tbody></table></div></div>
      </section>

      <section class="view hidden" id="settings">
        <div class="page-head"><div><h1 class="page-title">Settings</h1><p class="page-description">Bot identity, parse mode, timezone and Telegram commands.</p></div></div>
        <div class="grid two">
          <div class="card">
            <div class="section-head"><div><h2>Bot configuration</h2><p class="card-subtitle">Secrets remain in hosted runtime settings.</p></div></div>
            <div class="inline-fields"><div class="field"><label>Name</label><input id="botName" value="Cue"></div><div class="field"><label>Username</label><input id="botUsername" placeholder="cue_bot"></div></div>
            <div class="inline-fields"><div class="field"><label>Default parse mode</label><select id="botParse"><option>HTML</option><option>Markdown</option><option>MarkdownV2</option></select></div><div class="field"><label>Timezone</label><input id="botTimezone" value="Asia/Qyzylorda"></div></div>
            <label class="checkline"><input type="checkbox" id="botEnabled" checked>Bot enabled</label>
            <div class="divider"></div>
            <div class="section-head"><div><h2>Commands</h2><p class="card-subtitle">Command names omit the leading slash.</p></div><button class="btn small" id="addCommand">＋ Command</button></div>
            <div class="list-editor" id="commandRows"></div>
            <div class="form-actions"><button class="btn" id="syncCommands">Sync to Telegram</button><button class="btn primary" id="saveBotConfig">Save settings</button></div>
          </div>
          <div class="card">
            <div class="section-head"><div><h2>Deployment status</h2><p class="card-subtitle">No secret values are displayed.</p></div></div>
            <div class="readiness" id="settingsReadiness"></div>
            <div class="callout" style="margin-top:16px"><strong>Private deployment</strong><br>The admin interface remains owner-only. Telegram webhook and scheduler traffic need a separate public integration surface before live automation can run.</div>
          </div>
        </div>
      </section>
    </main>
  </div>
</div>
<div class="toast hidden" id="toast"></div>
<script>${uiScript}</script>
</body>
</html>`;

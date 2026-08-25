import { Hono } from 'hono';
import { z } from 'zod';
import { appHtml } from './ui';
import { Env, id, list, one } from './db';
import { resolveCalendarWindow } from './calendar';
import { evaluateCondition, renderTemplate, validateCondition, type RuleDefinition } from './domain';
import { isPausedByRule, periodKey, scheduleDue, scheduleWindow, type ReminderSchedule } from './schedule';

const app = new Hono<{ Bindings: Env }>();
app.get('/', (c) => c.html(appHtml));
app.get('/health', (c) => c.json({ ok: true, service: 'cue' }));

app.get('/api/dashboard', async (c) => {
  const reminders = await one<{ n:number }>(c.env.DB, 'SELECT COUNT(*) n FROM reminder_definitions WHERE enabled=1');
  const clients = await one<{ n:number }>(c.env.DB, 'SELECT COUNT(*) n FROM clients WHERE is_active=1');
  const pending = await one<{ n:number }>(c.env.DB, "SELECT COUNT(*) n FROM checklist_items WHERE status='pending'");
  return c.json({ reminders: reminders?.n ?? 0, clients: clients?.n ?? 0, pending: pending?.n ?? 0 });
});

app.get('/api/reminders', async (c) => c.json(await list(c.env.DB, 'SELECT id,name,priority,checklist_mode,enabled,schedule_json,pause_rules_json,condition_rule_json,template_id FROM reminder_definitions ORDER BY created_at DESC')));
app.get('/api/templates', async (c) => c.json(await list(c.env.DB, 'SELECT id,name,body,parse_mode,controls_json FROM message_templates ORDER BY name')));
app.get('/api/clients', async (c) => c.json(await list(c.env.DB, 'SELECT id,display_name,telegram_chat_id,telegram_user_id,calendar_id FROM clients ORDER BY display_name')));
app.get('/api/aliases', async (c) => c.json(await list(c.env.DB, 'SELECT id,key,value FROM aliases ORDER BY key')));
app.get('/api/runs', async (c) => c.json(await list(c.env.DB, "SELECT rr.*,rd.name reminder_name FROM reminder_runs rr JOIN reminder_definitions rd ON rd.id=rr.reminder_id ORDER BY rr.started_at DESC LIMIT 50")));
app.get('/api/runs/:id/checklist', async (c) => c.json(await list(c.env.DB, 'SELECT ci.*,cl.display_name FROM checklist_items ci LEFT JOIN clients cl ON cl.id=ci.client_id WHERE ci.run_id=? ORDER BY ci.label', c.req.param('id'))));

app.post('/api/clients', async (c) => {
  const body = z.object({ display_name:z.string().min(1), telegram_chat_id:z.string().min(1), telegram_user_id:z.string().optional(), calendar_id:z.string().optional() }).parse(await c.req.json());
  await c.env.DB.prepare('INSERT INTO clients(id,display_name,telegram_chat_id,telegram_user_id,calendar_id) VALUES(?,?,?,?,?)').bind(id('cli'), body.display_name, body.telegram_chat_id, body.telegram_user_id ?? null, body.calendar_id ?? null).run();
  return c.json({ ok:true }, 201);
});

app.post('/api/aliases', async (c) => {
  const body = z.object({ key:z.string().regex(/^[A-Za-z0-9_.-]+$/), value:z.string() }).parse(await c.req.json());
  await c.env.DB.prepare('INSERT INTO aliases(id,key,value) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(id('als'), body.key, body.value).run();
  return c.json({ ok:true }, 201);
});

app.post('/api/templates', async (c) => {
  const body = z.object({ name:z.string().min(1), body:z.string().min(1), controls:z.array(z.unknown()).default([]) }).parse(await c.req.json());
  const templateId=id('tpl');
  await c.env.DB.prepare('INSERT INTO message_templates(id,name,body,controls_json) VALUES(?,?,?,?)').bind(templateId,body.name,body.body,JSON.stringify(body.controls)).run();
  return c.json({ ok:true,id:templateId }, 201);
});

app.post('/api/reminders', async (c) => {
  const body=z.object({
    name:z.string().min(1), description:z.string().optional(), template_id:z.string().min(1), priority:z.enum(['low','normal','high','critical']).default('normal'),
    schedule:z.object({ kind:z.literal('weekly').optional(), weekdays:z.array(z.string()).min(1), startTime:z.string(), stopTime:z.string(), repeatEveryMinutes:z.number().int().min(1), timezone:z.string(), workingStart:z.string().optional(), workingEnd:z.string().optional() }),
    pauseRules:z.array(z.object({weekdays:z.array(z.string()).optional(),startTime:z.string(),endTime:z.string()})).default([]), checklistMode:z.boolean().default(false), targetIds:z.array(z.string()).default([]), conditionRule:z.unknown().optional()
  }).parse(await c.req.json());
  const reminderId=id('rem');
  await c.env.DB.prepare('INSERT INTO reminder_definitions(id,name,description,template_id,priority,schedule_json,pause_rules_json,condition_rule_json,checklist_mode) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(reminderId,body.name,body.description??null,body.template_id,body.priority,JSON.stringify(body.schedule),JSON.stringify(body.pauseRules),body.conditionRule?JSON.stringify(body.conditionRule):null,body.checklistMode?1:0).run();
  for(const clientId of body.targetIds) await c.env.DB.prepare('INSERT OR IGNORE INTO reminder_targets(reminder_id,client_id) VALUES(?,?)').bind(reminderId,clientId).run();
  return c.json({ok:true,id:reminderId},201);
});

app.post('/api/rules/validate', async (c) => {
  const rule = await c.req.json<RuleDefinition>();
  const errors = validateCondition(rule.condition);
  return c.json({ valid: errors.length===0, errors });
});

app.post('/api/runs/:id/pause', async (c) => {
  const body=z.object({until:z.string().datetime()}).parse(await c.req.json());
  await c.env.DB.prepare("UPDATE reminder_runs SET pause_until=? WHERE id=? AND status='active'").bind(body.until,c.req.param('id')).run();
  return c.json({ok:true});
});
app.post('/api/runs/:id/resume', async (c) => { await c.env.DB.prepare("UPDATE reminder_runs SET pause_until=NULL WHERE id=? AND status='active'").bind(c.req.param('id')).run(); return c.json({ok:true}); });
app.post('/api/runs/:id/stop', async (c) => { await c.env.DB.prepare("UPDATE reminder_runs SET status='stopped',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(c.req.param('id')).run(); return c.json({ok:true}); });
app.post('/api/checklist/:id/toggle', async (c) => {
  const item=await one<{status:string}>(c.env.DB,'SELECT status FROM checklist_items WHERE id=?',c.req.param('id'));
  if(!item) return c.json({error:'not found'},404);
  const next=item.status==='done'?'pending':'done';
  await c.env.DB.prepare("UPDATE checklist_items SET status=?,completed_at=CASE WHEN ?='done' THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?").bind(next,next,c.req.param('id')).run();
  return c.json({ok:true,status:next});
});

app.post('/api/presets/timesheet', async (c) => {
  const templateId = id('tpl'); const reminderId = id('rem');
  const schedule: ReminderSchedule = { kind:'weekly', weekdays:['fri'], startTime:'14:00', stopTime:'18:00', repeatEveryMinutes:30, timezone:c.env.APP_TIMEZONE ?? 'Asia/Qyzylorda', workingStart:'09:00', workingEnd:'18:00' };
  const rule: RuleDefinition = { condition:{ type:'group',operator:'and',children:[{type:'condition',left:'checklist.pendingCount',operator:'gt',right:0},{type:'condition',left:'calendar.isWorkingTime',operator:'eq',right:true}]}, then:[{type:'select_pending'},{type:'send_message'}], else:[{type:'stop_run'}] };
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO message_templates(id,name,body,controls_json) VALUES(?,?,?,?)').bind(templateId,'Weekly timesheet','Hi {{client.name}}!\n\nPlease complete your timesheet before {{deadline}}.\nRemaining: {{remaining_count}}.',JSON.stringify([{type:'callback',text:'Done',data:'checklist:done'}])),
    c.env.DB.prepare('INSERT INTO reminder_definitions(id,name,description,template_id,priority,schedule_json,condition_rule_json,checklist_mode) VALUES(?,?,?,?,?,?,?,1)').bind(reminderId,'Weekly timesheet','Friday reminder with checklist and repeated follow-ups for pending employees.',templateId,'high',JSON.stringify(schedule),JSON.stringify(rule))
  ]);
  const clients=await list<{id:string}>(c.env.DB,'SELECT id FROM clients WHERE is_active=1');
  for(const client of clients) await c.env.DB.prepare('INSERT OR IGNORE INTO reminder_targets(reminder_id,client_id) VALUES(?,?)').bind(reminderId,client.id).run();
  return c.json({ ok:true, reminderId, message:'Timesheet preset created and targeted to all active clients.' },201);
});

async function telegram(env: Env, method: string, payload: unknown) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
  const data = await r.json<any>(); if (!data.ok) throw new Error(data.description ?? 'Telegram API error'); return data.result;
}

app.post('/api/telegram/webhook', async (c) => {
  if (c.env.TELEGRAM_WEBHOOK_SECRET && c.req.header('x-telegram-bot-api-secret-token') !== c.env.TELEGRAM_WEBHOOK_SECRET) return c.json({ error:'unauthorized' },401);
  const u = await c.req.json<any>();
  const callbackData=String(u.callback_query?.data ?? '');
  if (callbackData.startsWith('checklist:done:')) {
    const checklistId=callbackData.slice('checklist:done:'.length);
    const item=await one<{id:string,status:string}>(c.env.DB,'SELECT id,status FROM checklist_items WHERE id=?',checklistId);
    if (item?.status==='pending') await c.env.DB.prepare("UPDATE checklist_items SET status='done',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(item.id).run();
    await telegram(c.env,'answerCallbackQuery',{callback_query_id:u.callback_query.id,text:item?(item.status==='pending'?'Marked done':'Already done'):'Checklist item not found'});
  }
  return c.json({ ok:true });
});

async function recipientsForRun(db:D1Database, reminderId:string, runId:string, checklistMode:boolean){
  if(checklistMode){
    return await list<any>(db,"SELECT c.*,ci.id checklist_item_id FROM checklist_items ci JOIN clients c ON c.id=ci.client_id WHERE ci.run_id=? AND ci.status='pending'",runId);
  }
  return await list<any>(db,'SELECT c.*,NULL checklist_item_id FROM reminder_targets rt JOIN clients c ON c.id=rt.client_id WHERE rt.reminder_id=? AND c.is_active=1',reminderId);
}

app.post('/api/cron/tick', async (c) => {
  if (c.env.CRON_SECRET && c.req.header('authorization') !== `Bearer ${c.env.CRON_SECRET}`) return c.json({error:'unauthorized'},401);
  const definitions=await list<any>(c.env.DB,'SELECT * FROM reminder_definitions WHERE enabled=1'); let sent=0;
  for(const d of definitions){
    const now=new Date(); const schedule=JSON.parse(d.schedule_json) as ReminderSchedule; const pauseRules=JSON.parse(d.pause_rules_json||'[]'); const currentPeriod=periodKey(schedule,now); const window=scheduleWindow(schedule,now);
    let run=await one<any>(c.env.DB,'SELECT * FROM reminder_runs WHERE reminder_id=? AND period_key=? LIMIT 1',d.id,currentPeriod);

    if(run?.status==='active' && window==='after'){
      await c.env.DB.prepare("UPDATE reminder_runs SET status='completed',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(run.id).run();
      continue;
    }
    if(window!=='active' || isPausedByRule(pauseRules,now,schedule.timezone??'UTC')) continue;

    if(!run){
      const runId=id('run');
      await c.env.DB.prepare('INSERT INTO reminder_runs(id,reminder_id,period_key,next_execution_at) VALUES(?,?,?,CURRENT_TIMESTAMP)').bind(runId,d.id,currentPeriod).run();
      run=await one<any>(c.env.DB,'SELECT * FROM reminder_runs WHERE id=?',runId);
      if(d.checklist_mode){
        const targets=await list<any>(c.env.DB,'SELECT c.* FROM reminder_targets rt JOIN clients c ON c.id=rt.client_id WHERE rt.reminder_id=? AND c.is_active=1',d.id);
        for(const t of targets) await c.env.DB.prepare('INSERT INTO checklist_items(id,run_id,client_id,label) VALUES(?,?,?,?)').bind(id('chk'),runId,t.id,t.display_name).run();
      }
    }
    if(!run || run.status!=='active' || (run.pause_until&&new Date(run.pause_until)>now) || !scheduleDue(schedule,now,run.last_executed_at)) continue;

    const counts=await one<any>(c.env.DB,"SELECT COUNT(*) total,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done FROM checklist_items WHERE run_id=?",run.id);
    const recipients=await recipientsForRun(c.env.DB,d.id,run.id,Boolean(d.checklist_mode));
    const calendar=await resolveCalendarWindow(c.env,recipients[0]?.calendar_id,now,schedule.timezone??c.env.APP_TIMEZONE??'UTC',schedule.workingStart??'09:00',schedule.workingEnd??'18:00');
    const ctx:any={
      'checklist.pendingCount':d.checklist_mode?(counts?.pending??0):recipients.length,
      'checklist.doneCount':counts?.done??0,
      'checklist.completionPercent':counts?.total?Math.round(((counts.done??0)/counts.total)*100):0,
      'calendar.isWorkingDay':calendar.isWorkingDay,
      'calendar.isWorkingTime':calendar.isWorkingTime,
      'calendar.isBusy':calendar.isBusy,
      'system.currentTime':new Intl.DateTimeFormat('en-GB',{timeZone:schedule.timezone,hour:'2-digit',minute:'2-digit',hour12:false}).format(now),
      'reminder.attempt':run.attempt,
      'reminder.priority':d.priority
    };
    const rule=d.condition_rule_json?JSON.parse(d.condition_rule_json) as RuleDefinition:null;
    if(rule&&!evaluateCondition(rule.condition,ctx)){
      await c.env.DB.prepare("UPDATE reminder_runs SET status='completed',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(run.id).run();
      continue;
    }
    if(d.checklist_mode && recipients.length===0){
      await c.env.DB.prepare("UPDATE reminder_runs SET status='completed',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(run.id).run();
      continue;
    }

    const tpl=await one<any>(c.env.DB,'SELECT * FROM message_templates WHERE id=?',d.template_id);if(!tpl)continue;const aliases=await list<any>(c.env.DB,'SELECT key,value FROM aliases');const aliasMap=Object.fromEntries(aliases.map(a=>[a.key,a.value]));
    for(const cl of recipients){
      const msg=renderTemplate(tpl.body,{...aliasMap,'client.name':cl.display_name,'remaining_count':recipients.length,'deadline':schedule.stopTime,'reminder.name':d.name,'reminder.priority':d.priority});
      const replyMarkup=cl.checklist_item_id?{inline_keyboard:[[{text:'Done',callback_data:`checklist:done:${cl.checklist_item_id}`}]]}:undefined;
      try{const result=await telegram(c.env,'sendMessage',{chat_id:cl.telegram_chat_id,text:msg,parse_mode:tpl.parse_mode,...(replyMarkup?{reply_markup:replyMarkup}:{})});await c.env.DB.prepare('INSERT INTO delivery_log(id,run_id,client_id,telegram_chat_id,template_id,rendered_message,status,telegram_message_id) VALUES(?,?,?,?,?,?,?,?)').bind(id('log'),run.id,cl.id,cl.telegram_chat_id,tpl.id,msg,'sent',String(result.message_id)).run();sent++;}catch(e){await c.env.DB.prepare('INSERT INTO delivery_log(id,run_id,client_id,telegram_chat_id,template_id,rendered_message,status,error) VALUES(?,?,?,?,?,?,?,?)').bind(id('log'),run.id,cl.id,cl.telegram_chat_id,tpl.id,msg,'failed',String(e)).run();}
    }
    await c.env.DB.prepare('UPDATE reminder_runs SET attempt=attempt+1,last_executed_at=CURRENT_TIMESTAMP WHERE id=?').bind(run.id).run();
  }
  return c.json({ok:true,sent});
});

app.onError((err,c)=>{console.error(err);return c.json({error:err instanceof Error?err.message:'Internal error'},500)});
export default app;

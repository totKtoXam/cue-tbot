import { Hono } from 'hono';
import { z } from 'zod';
import { appHtml } from './ui';
import { Env, id, list, one } from './db';
import { evaluateCondition, renderTemplate, validateCondition, type RuleDefinition } from './domain';

const app = new Hono<{ Bindings: Env }>();
app.get('/', (c) => c.html(appHtml));
app.get('/health', (c) => c.json({ ok: true, service: 'cue' }));

app.get('/api/dashboard', async (c) => {
  const reminders = await one<{ n:number }>(c.env.DB, 'SELECT COUNT(*) n FROM reminder_definitions WHERE enabled=1');
  const clients = await one<{ n:number }>(c.env.DB, 'SELECT COUNT(*) n FROM clients WHERE is_active=1');
  const pending = await one<{ n:number }>(c.env.DB, "SELECT COUNT(*) n FROM checklist_items WHERE status='pending'");
  return c.json({ reminders: reminders?.n ?? 0, clients: clients?.n ?? 0, pending: pending?.n ?? 0 });
});

app.get('/api/reminders', async (c) => c.json(await list(c.env.DB, 'SELECT id,name,priority,checklist_mode,enabled FROM reminder_definitions ORDER BY created_at DESC')));
app.get('/api/clients', async (c) => c.json(await list(c.env.DB, 'SELECT id,display_name,telegram_chat_id FROM clients ORDER BY display_name')));
app.get('/api/aliases', async (c) => c.json(await list(c.env.DB, 'SELECT id,key,value FROM aliases ORDER BY key')));

app.post('/api/clients', async (c) => {
  const body = z.object({ display_name:z.string().min(1), telegram_chat_id:z.string().min(1) }).parse(await c.req.json());
  await c.env.DB.prepare('INSERT INTO clients(id,display_name,telegram_chat_id) VALUES(?,?,?)').bind(id('cli'), body.display_name, body.telegram_chat_id).run();
  return c.json({ ok:true }, 201);
});

app.post('/api/aliases', async (c) => {
  const body = z.object({ key:z.string().regex(/^[A-Za-z0-9_.-]+$/), value:z.string() }).parse(await c.req.json());
  await c.env.DB.prepare('INSERT INTO aliases(id,key,value) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP').bind(id('als'), body.key, body.value).run();
  return c.json({ ok:true }, 201);
});

app.post('/api/templates', async (c) => {
  const body = z.object({ name:z.string().min(1), body:z.string().min(1), controls:z.array(z.unknown()).default([]) }).parse(await c.req.json());
  await c.env.DB.prepare('INSERT INTO message_templates(id,name,body,controls_json) VALUES(?,?,?,?)').bind(id('tpl'),body.name,body.body,JSON.stringify(body.controls)).run();
  return c.json({ ok:true }, 201);
});

app.post('/api/rules/validate', async (c) => {
  const rule = await c.req.json<RuleDefinition>();
  const errors = validateCondition(rule.condition);
  return c.json({ valid: errors.length===0, errors });
});

app.post('/api/presets/timesheet', async (c) => {
  const templateId = id('tpl');
  const reminderId = id('rem');
  const schedule = { kind:'weekly', weekdays:['fri'], startTime:'14:00', stopTime:'18:00', repeatEveryMinutes:30, timezone:c.env.APP_TIMEZONE ?? 'Asia/Qyzylorda' };
  const rule: RuleDefinition = {
    condition:{ type:'group',operator:'and',children:[
      {type:'condition',left:'checklist.pendingCount',operator:'gt',right:0},
      {type:'condition',left:'calendar.isWorkingTime',operator:'eq',right:true}
    ]},
    then:[{type:'select_pending'},{type:'send_message'}],
    else:[{type:'stop_run'}]
  };
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO message_templates(id,name,body,controls_json) VALUES(?,?,?,?)').bind(templateId,'Weekly timesheet','Hi {{client.name}}!\n\nPlease complete your timesheet before {{deadline}}.\nRemaining: {{remaining_count}}.',JSON.stringify([{type:'callback',text:'Done',data:'checklist:done'}])),
    c.env.DB.prepare('INSERT INTO reminder_definitions(id,name,description,template_id,priority,schedule_json,condition_rule_json,checklist_mode) VALUES(?,?,?,?,?,?,?,1)').bind(reminderId,'Weekly timesheet','Friday reminder with checklist and repeated follow-ups for pending employees.',templateId,'high',JSON.stringify(schedule),JSON.stringify(rule))
  ]);
  return c.json({ ok:true, reminderId, message:'Timesheet preset created.' },201);
});

async function telegram(env: Env, method: string, payload: unknown) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)
  });
  const data = await r.json<any>();
  if (!data.ok) throw new Error(data.description ?? 'Telegram API error');
  return data.result;
}

app.post('/api/telegram/webhook', async (c) => {
  if (c.env.TELEGRAM_WEBHOOK_SECRET && c.req.header('x-telegram-bot-api-secret-token') !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error:'unauthorized' },401);
  }
  const u = await c.req.json<any>();
  if (u.callback_query?.data?.startsWith('checklist:done')) {
    const userId=String(u.callback_query.from.id);
    const item=await one<{id:string}>(c.env.DB,"SELECT ci.id FROM checklist_items ci JOIN clients cl ON cl.id=ci.client_id WHERE cl.telegram_user_id=? AND ci.status='pending' ORDER BY ci.rowid DESC LIMIT 1",userId);
    if (item) await c.env.DB.prepare("UPDATE checklist_items SET status='done',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(item.id).run();
    await telegram(c.env,'answerCallbackQuery',{callback_query_id:u.callback_query.id,text:item?'Marked done':'No pending item'});
  }
  return c.json({ ok:true });
});

function localClock(timeZone:string, date=new Date()) {
  const p=new Intl.DateTimeFormat('en-GB',{timeZone,weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  return Object.fromEntries(p.map(x=>[x.type,x.value]));
}

function scheduleDue(schedule:any, now:Date, last?:string|null) {
  const p=localClock(schedule.timezone??'UTC',now);
  const wd=String(p.weekday).toLowerCase().slice(0,3);
  const hhmm=`${p.hour}:${p.minute}`;
  if(schedule.weekdays&&!schedule.weekdays.includes(wd)) return false;
  if(hhmm<schedule.startTime||hhmm>schedule.stopTime) return false;
  if(!last) return true;
  return now.getTime()-new Date(last).getTime()>=Number(schedule.repeatEveryMinutes??30)*60000;
}

app.post('/api/cron/tick', async (c) => {
  if (c.env.CRON_SECRET && c.req.header('authorization') !== `Bearer ${c.env.CRON_SECRET}`) return c.json({error:'unauthorized'},401);
  const definitions=await list<any>(c.env.DB,'SELECT * FROM reminder_definitions WHERE enabled=1');
  let sent=0;
  for(const d of definitions){
    const schedule=JSON.parse(d.schedule_json);
    let run=await one<any>(c.env.DB,"SELECT * FROM reminder_runs WHERE reminder_id=? AND status='active' ORDER BY started_at DESC LIMIT 1",d.id);
    if(!run){
      if(!scheduleDue(schedule,new Date(),null)) continue;
      const runId=id('run');
      await c.env.DB.prepare('INSERT INTO reminder_runs(id,reminder_id,next_execution_at) VALUES(?,?,CURRENT_TIMESTAMP)').bind(runId,d.id).run();
      run=await one<any>(c.env.DB,'SELECT * FROM reminder_runs WHERE id=?',runId);
      if(d.checklist_mode){
        const targets=await list<any>(c.env.DB,'SELECT c.* FROM reminder_targets rt JOIN clients c ON c.id=rt.client_id WHERE rt.reminder_id=?',d.id);
        for(const t of targets) await c.env.DB.prepare('INSERT INTO checklist_items(id,run_id,client_id,label) VALUES(?,?,?,?)').bind(id('chk'),runId,t.id,t.display_name).run();
      }
    }
    if(!run || (run.pause_until&&new Date(run.pause_until)>new Date()) || !scheduleDue(schedule,new Date(),run.last_executed_at)) continue;

    const counts=await one<any>(c.env.DB,"SELECT COUNT(*) total,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done FROM checklist_items WHERE run_id=?",run.id);
    const ctx:any={
      'checklist.pendingCount':counts?.pending??0,
      'checklist.doneCount':counts?.done??0,
      'calendar.isWorkingTime':true,
      'reminder.attempt':run.attempt,
      'reminder.priority':d.priority
    };
    const rule=d.condition_rule_json?JSON.parse(d.condition_rule_json) as RuleDefinition:null;
    if(rule&&!evaluateCondition(rule.condition,ctx)){
      await c.env.DB.prepare("UPDATE reminder_runs SET status='completed',stopped_at=CURRENT_TIMESTAMP WHERE id=?").bind(run.id).run();
      continue;
    }

    const pending=await list<any>(c.env.DB,"SELECT c.*,ci.id checklist_item_id FROM checklist_items ci JOIN clients c ON c.id=ci.client_id WHERE ci.run_id=? AND ci.status='pending'",run.id);
    const tpl=await one<any>(c.env.DB,'SELECT * FROM message_templates WHERE id=?',d.template_id);
    if (!tpl) continue;
    const aliases=await list<any>(c.env.DB,'SELECT key,value FROM aliases');
    const aliasMap=Object.fromEntries(aliases.map(a=>[a.key,a.value]));
    for(const cl of pending){
      const msg=renderTemplate(tpl.body,{...aliasMap,'client.name':cl.display_name,'remaining_count':pending.length,'deadline':schedule.stopTime});
      try{
        const result=await telegram(c.env,'sendMessage',{chat_id:cl.telegram_chat_id,text:msg,parse_mode:tpl.parse_mode,reply_markup:{inline_keyboard:[[{text:'Done',callback_data:'checklist:done'}]]}});
        await c.env.DB.prepare('INSERT INTO delivery_log(id,run_id,client_id,telegram_chat_id,template_id,rendered_message,status,telegram_message_id) VALUES(?,?,?,?,?,?,?,?)').bind(id('log'),run.id,cl.id,cl.telegram_chat_id,tpl.id,msg,'sent',String(result.message_id)).run();
        sent++;
      }catch(e){
        await c.env.DB.prepare('INSERT INTO delivery_log(id,run_id,client_id,telegram_chat_id,template_id,rendered_message,status,error) VALUES(?,?,?,?,?,?,?,?)').bind(id('log'),run.id,cl.id,cl.telegram_chat_id,tpl.id,msg,'failed',String(e)).run();
      }
    }
    await c.env.DB.prepare('UPDATE reminder_runs SET attempt=attempt+1,last_executed_at=CURRENT_TIMESTAMP WHERE id=?').bind(run.id).run();
  }
  return c.json({ok:true,sent});
});

app.onError((err,c)=>{
  console.error(err);
  return c.json({error:err instanceof Error?err.message:'Internal error'},500);
});

export default app;

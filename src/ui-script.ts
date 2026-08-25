export const uiScript = String.raw`
const $ = (selector, root) => (root || document).querySelector(selector);
const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
const days = ['mon','tue','wed','thu','fri','sat','sun'];
const dayNames = {mon:'Mon',tue:'Tue',wed:'Wed',thu:'Thu',fri:'Fri',sat:'Sat',sun:'Sun'};
const slots = [];
for (let hour=0; hour<24; hour++) for (const minute of [0,30]) slots.push(String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0'));

const state = {
  clients: [], templates: [], works: [], reminders: [], aliases: [], runs: [], deliveries: [],
  runtime: {}, bot: null, editingClient: null, editingTemplate: null, editingWork: null, editingReminder: null
};
let selected = Object.fromEntries(days.map((day) => [day,new Set()]));
let exceptions = [];
let controls = [];
let commands = [];
let pauseRules = [];
const ruleState = {
  root: {type:'group',operator:'and',children:[
    {type:'condition',left:'checklist.pendingCount',operator:'gt',right:0},
    {type:'condition',left:'schedule.isWorkingTime',operator:'eq',right:true}
  ]},
  then: [{type:'send_message'}],
  else: [{type:'skip'}]
};
const baseSources = [
  'checklist.pendingCount','checklist.doneCount','checklist.completionPercent',
  'schedule.isWorkingDay','schedule.isWorkingTime','schedule.currentTime','schedule.weekday','schedule.currentInterval',
  'reminder.priority','reminder.attempt','client.name','client.tags','client.timezone'
];
const operators = ['eq','neq','gt','gte','lt','lte','contains','not_contains','in','not_in','empty','not_empty','before','after','between'];
const actionTypes = ['send_message','select_pending','skip','stop_run','pause_run','change_priority','mark_done','webhook'];
const controlTypes = ['callback','url','reply','command','request_contact','request_location','web_app'];

function parse(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char])); }
function badge(value, tone) { return '<span class="badge '+(tone || '')+'">'+escapeHtml(value)+'</span>'; }
function emptyRow(columns, message) { return '<tr><td colspan="'+columns+'"><div class="empty">'+escapeHtml(message)+'</div></td></tr>'; }
function tags(value) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }

async function api(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

let toastTimer;
function notify(message, error) {
  const element = $('#toast');
  element.textContent = message;
  element.className = 'toast'+(error?' error':'');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.className='toast hidden', 3500);
}

function showView(view) {
  $$('.view').forEach((element) => element.classList.add('hidden'));
  $('#'+view).classList.remove('hidden');
  $$('.nav-item').forEach((button) => button.classList.toggle('active',button.dataset.view===view));
  const active = $('.nav-item[data-view="'+view+'"]');
  $('#currentTitle').textContent = active ? active.dataset.title : view;
  $('#sidebar').classList.remove('open');
  if (view==='runs') refreshRuns();
  if (view==='deliveries') refreshDeliveries();
}

$$('.nav-item').forEach((button) => button.onclick=()=>showView(button.dataset.view));
$$('[data-go]').forEach((button) => button.onclick=()=>showView(button.dataset.go));
$('#mobileMenu').onclick=()=>$('#sidebar').classList.toggle('open');

function renderReadiness() {
  const items = [
    ['Telegram bot token',Boolean(state.runtime.telegramToken)],
    ['Webhook secret',Boolean(state.runtime.telegramWebhookSecret)],
    ['Scheduler secret',Boolean(state.runtime.cronSecret)]
  ];
  const html = items.map((item) => '<div class="ready-row"><span>'+item[0]+'</span>'+badge(item[1]?'Configured':'Missing',item[1]?'good':'warn')+'</div>').join('');
  $('#runtimeReadiness').innerHTML = html;
  $('#settingsReadiness').innerHTML = html+'<div class="ready-row"><span>Runtime timezone</span>'+badge(state.runtime.timezone || '—','info')+'</div>';
  const ready = items.every((item) => item[1]);
  $('#topStatusDot').classList.toggle('ready',ready);
  $('#topStatusText').textContent = ready ? 'Runtime ready' : 'Setup required';
}

function renderDashboard(data) {
  $('#statReminders').textContent = data.reminders;
  $('#statClients').textContent = data.clients;
  $('#statPending').textContent = data.pending;
  $('#statRuns').textContent = data.runs;
  const recent = state.runs.slice(0,5);
  $('#dashboardRuns').innerHTML = recent.length ? recent.map((run) => '<tr><td><strong>'+escapeHtml(run.reminder_name)+'</strong></td><td class="mono">'+escapeHtml(run.period_key)+'</td><td>'+statusBadge(run.status)+'</td><td>'+escapeHtml(run.attempt)+'</td></tr>').join('') : emptyRow(4,'No runs yet');
}

function statusBadge(status) {
  const tone = status==='active'?'info':status==='completed'?'good':status==='stopped'?'bad':'';
  return badge(status,tone);
}

function fillSelect(element, rows, placeholder) {
  element.innerHTML = (placeholder?'<option value="">'+escapeHtml(placeholder)+'</option>':'') + rows.map((row) => '<option value="'+escapeHtml(row.id)+'">'+escapeHtml(row.name || row.display_name)+'</option>').join('');
}

function renderClients() {
  $('#clientRows').innerHTML = state.clients.length ? state.clients.map((client) => {
    const clientTags = parse(client.tags_json,[]);
    return '<tr><td><strong>'+escapeHtml(client.display_name)+'</strong></td><td class="mono">'+escapeHtml(client.telegram_chat_id)+'</td><td>'+escapeHtml(client.timezone || '—')+'</td><td>'+escapeHtml(clientTags.join(', ') || '—')+'</td><td>'+badge(client.is_active?'Active':'Inactive',client.is_active?'good':'')+'</td><td class="right"><button class="btn small" data-edit-client="'+client.id+'">Edit</button></td></tr>';
  }).join('') : emptyRow(6,'No clients yet');
  $('#remTargets').innerHTML = state.clients.length ? state.clients.map((client) => '<label><input type="checkbox" value="'+client.id+'">'+escapeHtml(client.display_name)+'</label>').join('') : '<div class="empty">Add clients first</div>';
  $$('[data-edit-client]').forEach((button) => button.onclick=()=>editClient(button.dataset.editClient));
}

function resetClient() {
  state.editingClient = null;
  $('#clientEditorTitle').textContent='New client';
  $('#clientName').value=''; $('#clientChat').value=''; $('#clientUser').value=''; $('#clientTimezone').value=''; $('#clientTags').value=''; $('#clientCustom').value=''; $('#clientActive').checked=true;
}
function editClient(id) {
  const client = state.clients.find((item) => item.id===id); if(!client) return;
  state.editingClient=id; $('#clientEditorTitle').textContent='Edit client';
  $('#clientName').value=client.display_name; $('#clientChat').value=client.telegram_chat_id; $('#clientUser').value=client.telegram_user_id || ''; $('#clientTimezone').value=client.timezone || '';
  $('#clientTags').value=parse(client.tags_json,[]).join(', '); $('#clientCustom').value=JSON.stringify(parse(client.custom_fields_json,{}),null,2); $('#clientActive').checked=Boolean(client.is_active);
  showView('clients'); window.scrollTo({top:0,behavior:'smooth'});
}
$('#newClient').onclick=resetClient; $('#cancelClient').onclick=resetClient;
$('#saveClient').onclick=async()=>{
  try {
    const customFields = $('#clientCustom').value.trim()?JSON.parse($('#clientCustom').value):{};
    const body={display_name:$('#clientName').value,telegram_chat_id:$('#clientChat').value,telegram_user_id:$('#clientUser').value,timezone:$('#clientTimezone').value,tags:tags($('#clientTags').value),customFields,is_active:$('#clientActive').checked};
    const url=state.editingClient?'/api/clients/'+state.editingClient:'/api/clients';
    await api(url,{method:state.editingClient?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    notify(state.editingClient?'Client updated':'Client created'); resetClient(); await refreshAll();
  } catch(error) { notify(error.message,true); }
};

function renderAliases() {
  $('#aliasRows').innerHTML = state.aliases.length ? state.aliases.map((alias) => '<tr><td class="mono">{{'+escapeHtml(alias.key)+'}}</td><td>'+escapeHtml(alias.value)+'</td><td class="right"><div class="row-actions"><button class="btn small" data-edit-alias="'+alias.id+'">Edit</button><button class="btn small danger" data-delete-alias="'+alias.id+'">Delete</button></div></td></tr>').join('') : emptyRow(3,'No aliases yet');
  $$('[data-edit-alias]').forEach((button) => button.onclick=()=>{const item=state.aliases.find((x)=>x.id===button.dataset.editAlias);if(item){$('#aliasKey').value=item.key;$('#aliasValue').value=item.value;}});
  $$('[data-delete-alias]').forEach((button) => button.onclick=async()=>{if(!confirm('Delete this alias?'))return;try{await api('/api/aliases/'+button.dataset.deleteAlias,{method:'DELETE'});notify('Alias deleted');await refreshAll();}catch(error){notify(error.message,true);}});
}
$('#saveAlias').onclick=async()=>{try{await api('/api/aliases',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:$('#aliasKey').value,value:$('#aliasValue').value})});$('#aliasKey').value='';$('#aliasValue').value='';notify('Alias saved');await refreshAll();}catch(error){notify(error.message,true);}};

function renderTemplateList() {
  if(!state.templates.length){$('#templateList').innerHTML='<div class="empty">No messages yet</div>';return;}
  $('#templateList').innerHTML=state.templates.map((template) => '<div class="quick-step"><span class="step-number">▤</span><div><b>'+escapeHtml(template.name)+'</b><span>'+escapeHtml(template.parse_mode)+' · '+parse(template.controls_json,[]).length+' controls</span></div><button class="btn small" data-edit-template="'+template.id+'">Edit</button></div>').join('');
  $$('[data-edit-template]').forEach((button)=>button.onclick=()=>editTemplate(button.dataset.editTemplate));
}

function resetTemplate() {
  state.editingTemplate=null; controls=[]; $('#templateEditorTitle').textContent='New message'; $('#templateName').value=''; $('#templateParse').value='HTML';
  $('#templateBody').value='Hi {{client.name}}!\n\nPlease complete the task before {{deadline}}.\nRemaining: {{remaining_count}}.'; renderControls(); renderMessagePreview();
}
function editTemplate(id) {
  const template=state.templates.find((item)=>item.id===id);if(!template)return;
  state.editingTemplate=id;$('#templateEditorTitle').textContent='Edit message';$('#templateName').value=template.name;$('#templateParse').value=template.parse_mode;$('#templateBody').value=template.body;controls=parse(template.controls_json,[]);renderControls();renderMessagePreview();showView('messages');window.scrollTo({top:0,behavior:'smooth'});
}
function renderControls() {
  $('#controlRows').innerHTML=controls.length?controls.map((control,index)=>'<div class="list-row control-row"><select data-control-type="'+index+'">'+controlTypes.map((type)=>'<option '+(type===control.type?'selected':'')+'>'+type+'</option>').join('')+'</select><input data-control-text="'+index+'" placeholder="Button text" value="'+escapeHtml(control.text || '')+'"><input data-control-value="'+index+'" placeholder="Callback, URL or command" value="'+escapeHtml(control.value || '')+'"><input data-control-row="'+index+'" type="number" min="0" value="'+Number(control.row || 0)+'"><button class="btn icon danger" data-remove-control="'+index+'">×</button></div>').join(''):'<div class="empty">No controls. Checklist messages receive a default Done button.</div>';
  $$('[data-control-type]').forEach((input)=>input.onchange=()=>{controls[Number(input.dataset.controlType)].type=input.value;renderMessagePreview();});
  $$('[data-control-text]').forEach((input)=>input.oninput=()=>{controls[Number(input.dataset.controlText)].text=input.value;renderMessagePreview();});
  $$('[data-control-value]').forEach((input)=>input.oninput=()=>{controls[Number(input.dataset.controlValue)].value=input.value;renderMessagePreview();});
  $$('[data-control-row]').forEach((input)=>input.oninput=()=>controls[Number(input.dataset.controlRow)].row=Number(input.value));
  $$('[data-remove-control]').forEach((button)=>button.onclick=()=>{controls.splice(Number(button.dataset.removeControl),1);renderControls();renderMessagePreview();});
}
function renderMessagePreview() {
  const values={'client.name':'Ada','deadline':'18:00','remaining_count':3,'reminder.name':'Weekly timesheet','reminder.priority':'high'};
  let text=$('#templateBody').value;
  text=text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,(match,key)=>values[key] || (state.aliases.find((item)=>item.key===key)||{}).value || '');
  const controlText=controls.length?'\n\nControls\n'+controls.map((control)=>'['+control.row+'] '+control.type+' · '+(control.text||'Untitled')).join('\n'):'';
  $('#messagePreview').textContent=text+controlText;
}
$('#templateBody').oninput=renderMessagePreview;$('#addControl').onclick=()=>{controls.push({type:'callback',text:'Done',value:'checklist:done',row:0});renderControls();renderMessagePreview();};
$('#newTemplate').onclick=resetTemplate;$('#cancelTemplate').onclick=resetTemplate;
$('#saveTemplate').onclick=async()=>{try{const body={name:$('#templateName').value,body:$('#templateBody').value,parse_mode:$('#templateParse').value,controls};const url=state.editingTemplate?'/api/templates/'+state.editingTemplate:'/api/templates';await api(url,{method:state.editingTemplate?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});notify(state.editingTemplate?'Message updated':'Message created');resetTemplate();await refreshAll();}catch(error){notify(error.message,true);}};

function resetWork() {
  state.editingWork=null;$('#workEditorTitle').textContent='New schedule';$('#workName').value='Default work schedule';$('#workTimezone').value='Asia/Qyzylorda';$('#workDefault').checked=false;exceptions=[];
  selected=Object.fromEntries(days.map((day)=>[day,new Set()]));
  days.slice(0,5).forEach((day)=>slots.forEach((time,index)=>{if((time>='09:00'&&time<'13:00')||(time>='14:00'&&time<'18:00'))selected[day].add(index);}));
  renderWeek();renderExceptions();
}
function endSlot(index) { const parts=slots[index].split(':').map(Number);const total=parts[0]*60+parts[1]+30;return String(Math.floor(total/60)%24).padStart(2,'0')+':'+String(total%60).padStart(2,'0'); }
function dayIntervals(day) { const ids=Array.from(selected[day]).sort((a,b)=>a-b);if(!ids.length)return[];const result=[];let start=ids[0],previous=start;for(const current of ids.slice(1)){if(current===previous+1){previous=current;continue;}result.push({start:slots[start],end:endSlot(previous)});start=current;previous=current;}result.push({start:slots[start],end:endSlot(previous)});return result; }
function renderWeek() {
  const grid=$('#weekGrid');
  grid.innerHTML='<div class="wg-head"></div>'+slots.map((slot,index)=>'<div class="wg-head">'+(index%2===0?slot:'')+'</div>').join('');
  days.forEach((day)=>{grid.insertAdjacentHTML('beforeend','<div class="wg-day">'+dayNames[day]+'</div>');slots.forEach((slot,index)=>grid.insertAdjacentHTML('beforeend','<div class="slot '+(selected[day].has(index)?'on':'')+'" data-day="'+day+'" data-slot="'+index+'" aria-label="'+dayNames[day]+' '+slot+'"></div>'));});
  let drag=null;
  $$('.slot',grid).forEach((cell)=>{cell.onmousedown=(event)=>{event.preventDefault();drag={day:cell.dataset.day,on:!selected[cell.dataset.day].has(Number(cell.dataset.slot)),start:cell,started:false};};cell.onmouseenter=()=>{if(drag&&drag.day===cell.dataset.day){if(!drag.started){paintCell(drag.start,drag.on);drag.started=true;}paintCell(cell,drag.on);}};cell.onclick=()=>{if(!drag||!drag.started)paintCell(cell,!selected[cell.dataset.day].has(Number(cell.dataset.slot)));};});
  document.onmouseup=()=>setTimeout(()=>drag=null,0);
}
function paintCell(cell,on){const day=cell.dataset.day,index=Number(cell.dataset.slot);if(on)selected[day].add(index);else selected[day].delete(index);cell.classList.toggle('on',on);}
function renderExceptions() {
  $('#exceptionRows').innerHTML=exceptions.length?exceptions.map((item,index)=>'<div class="exception-row"><input type="date" value="'+escapeHtml(item.date || '')+'" data-ex-date="'+index+'"><select data-ex-working="'+index+'"><option value="false" '+(!item.working?'selected':'')+'>Day off</option><option value="true" '+(item.working?'selected':'')+'>Working day</option></select><input value="'+escapeHtml((item.intervals||[]).map((interval)=>interval.start+'-'+interval.end).join(','))+'" placeholder="09:00-13:00,14:00-18:00" data-ex-intervals="'+index+'"><button class="btn icon danger" data-remove-exception="'+index+'">×</button></div>').join(''):'<div class="empty">No date exceptions</div>';
  $$('[data-ex-date]').forEach((input)=>input.onchange=()=>exceptions[Number(input.dataset.exDate)].date=input.value);
  $$('[data-ex-working]').forEach((input)=>input.onchange=()=>exceptions[Number(input.dataset.exWorking)].working=input.value==='true');
  $$('[data-ex-intervals]').forEach((input)=>input.onchange=()=>exceptions[Number(input.dataset.exIntervals)].intervals=input.value.split(',').map((part)=>part.trim()).filter(Boolean).map((part)=>{const pair=part.split('-');return{start:pair[0],end:pair[1]};}));
  $$('[data-remove-exception]').forEach((button)=>button.onclick=()=>{exceptions.splice(Number(button.dataset.removeException),1);renderExceptions();});
}
function renderWorkRows() {
  $('#workRows').innerHTML=state.works.length?state.works.map((work)=>'<tr><td><strong>'+escapeHtml(work.name)+'</strong></td><td>'+escapeHtml(work.timezone)+'</td><td>'+(work.is_default?badge('Default','info'):'—')+'</td><td class="right"><button class="btn small" data-edit-work="'+work.id+'">Edit</button></td></tr>').join(''):emptyRow(4,'No schedules yet');
  $$('[data-edit-work]').forEach((button)=>button.onclick=()=>editWork(button.dataset.editWork));
}
function editWork(id) {
  const work=state.works.find((item)=>item.id===id);if(!work)return;state.editingWork=id;$('#workEditorTitle').textContent='Edit schedule';$('#workName').value=work.name;$('#workTimezone').value=work.timezone;$('#workDefault').checked=Boolean(work.is_default);exceptions=parse(work.exceptions_json,[]);selected=Object.fromEntries(days.map((day)=>[day,new Set()]));const weekly=parse(work.weekly_json,{});days.forEach((day)=>slots.forEach((time,index)=>{if((weekly[day]||[]).some((interval)=>time>=interval.start&&time<interval.end))selected[day].add(index);}));renderWeek();renderExceptions();showView('work');window.scrollTo({top:0,behavior:'smooth'});
}
$('#addException').onclick=()=>{exceptions.push({date:'',working:false,intervals:[]});renderExceptions();};$('#newWork').onclick=resetWork;$('#cancelWork').onclick=resetWork;
$('#copyDay').onclick=()=>{selected[$('#copyTo').value]=new Set(selected[$('#copyFrom').value]);renderWeek();};$('#clearSelectedDay').onclick=()=>{selected[$('#clearDay').value].clear();renderWeek();};
$('#saveWork').onclick=async()=>{try{const weekly={};days.forEach((day)=>weekly[day]=dayIntervals(day));const body={name:$('#workName').value,timezone:$('#workTimezone').value,weekly,exceptions,isDefault:$('#workDefault').checked};const url=state.editingWork?'/api/work-schedules/'+state.editingWork:'/api/work-schedules';await api(url,{method:state.editingWork?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});notify(state.editingWork?'Schedule updated':'Schedule created');resetWork();await refreshAll();}catch(error){notify(error.message,true);}};

function currentSources() { return baseSources.concat(state.aliases.map((alias)=>'alias.'+alias.key)); }
function removeNode(group,node){const index=group.children.indexOf(node);if(index>=0){group.children.splice(index,1);return true;}return group.children.some((child)=>child.type==='group'&&removeNode(child,node));}
function drawConditions(){const root=$('#conditionTree');root.innerHTML='';drawGroup(ruleState.root,root,true);drawActions('then');drawActions('else');previewCondition();}
function drawGroup(group,host,isRoot){
  const box=document.createElement('div');box.className='rule-group';
  const head=document.createElement('div');head.className='rule-head';head.innerHTML='<strong>'+(isRoot?'WHEN':'GROUP')+'</strong><select><option value="and">ALL / AND</option><option value="or">ANY / OR</option></select>'+(isRoot?'':'<button class="btn small danger">Remove group</button>');
  const select=$('select',head);select.value=group.operator;select.onchange=()=>{group.operator=select.value;previewCondition();};
  if(!isRoot)$('button',head).onclick=()=>{removeNode(ruleState.root,group);drawConditions();};box.appendChild(head);
  group.children.forEach((node)=>node.type==='group'?drawGroup(node,box,false):drawLeaf(node,box));
  const actions=document.createElement('div');actions.className='actions';const addCondition=document.createElement('button');addCondition.className='btn small';addCondition.textContent='＋ Condition';addCondition.onclick=()=>{group.children.push({type:'condition',left:'schedule.isWorkingTime',operator:'eq',right:true});drawConditions();};const addGroup=document.createElement('button');addGroup.className='btn small';addGroup.textContent='＋ Group';addGroup.onclick=()=>{group.children.push({type:'group',operator:'or',children:[]});drawConditions();};actions.append(addCondition,addGroup);box.appendChild(actions);host.appendChild(box);
}
function drawLeaf(node,host){const row=document.createElement('div');row.className='rule-line';const source=document.createElement('select');currentSources().forEach((value)=>source.add(new Option(value,value)));source.value=node.left;source.onchange=()=>{node.left=source.value;previewCondition();};const operator=document.createElement('select');operators.forEach((value)=>operator.add(new Option(value,value)));operator.value=node.operator;operator.onchange=()=>{node.operator=operator.value;previewCondition();};const value=document.createElement('input');value.value=Array.isArray(node.right)?node.right.join(','):String(node.right==null?'':node.right);value.placeholder='Value';value.oninput=()=>{const raw=value.value;if(['in','not_in','between'].includes(node.operator))node.right=raw.split(',').map((item)=>item.trim());else node.right=raw==='true'?true:raw==='false'?false:(raw!==''&&!isNaN(Number(raw))?Number(raw):raw);previewCondition();};const remove=document.createElement('button');remove.className='btn icon danger';remove.textContent='×';remove.onclick=()=>{removeNode(ruleState.root,node);drawConditions();};row.append(source,operator,value,remove);host.appendChild(row);}
function actionConfigPlaceholder(type){if(type==='pause_run')return'Minutes';if(type==='change_priority')return'low | normal | high | critical';if(type==='mark_done')return'Checklist item ID';if(type==='webhook')return'https://…';return'No configuration';}
function actionConfigValue(action){if(action.type==='pause_run')return action.config&&action.config.minutes||'';if(action.type==='change_priority')return action.config&&action.config.priority||'';if(action.type==='mark_done')return action.config&&action.config.checklistItemId||'';if(action.type==='webhook')return action.config&&action.config.url||'';return'';}
function setActionConfig(action,value){if(action.type==='pause_run')action.config={minutes:Number(value||60)};else if(action.type==='change_priority')action.config={priority:value};else if(action.type==='mark_done')action.config={checklistItemId:value};else if(action.type==='webhook')action.config={url:value};else delete action.config;}
function drawActions(branch){const actions=ruleState[branch];const host=$('#'+branch+'Actions');host.innerHTML=actions.length?actions.map((action,index)=>'<div class="list-row action-row"><select data-action-type="'+branch+'-'+index+'">'+actionTypes.map((type)=>'<option '+(type===action.type?'selected':'')+'>'+type+'</option>').join('')+'</select><input data-action-config="'+branch+'-'+index+'" placeholder="'+escapeHtml(actionConfigPlaceholder(action.type))+'" value="'+escapeHtml(actionConfigValue(action))+'" '+(['send_message','select_pending','skip','stop_run'].includes(action.type)?'disabled':'')+'><button class="btn icon danger" data-remove-action="'+branch+'-'+index+'">×</button></div>').join(''):'<div class="empty">No actions</div>';
  $$('[data-action-type]',host).forEach((select)=>select.onchange=()=>{const parts=select.dataset.actionType.split('-');const action=ruleState[parts[0]][Number(parts[1])];action.type=select.value;delete action.config;drawActions(parts[0]);previewCondition();});
  $$('[data-action-config]',host).forEach((input)=>input.oninput=()=>{const parts=input.dataset.actionConfig.split('-');setActionConfig(ruleState[parts[0]][Number(parts[1])],input.value);previewCondition();});
  $$('[data-remove-action]',host).forEach((button)=>button.onclick=()=>{const parts=button.dataset.removeAction.split('-');ruleState[parts[0]].splice(Number(parts[1]),1);drawActions(parts[0]);previewCondition();});
}
function humanCondition(node,depth){depth=depth||0;return node.type==='condition'?'  '.repeat(depth)+'• '+node.left+' '+node.operator+' '+JSON.stringify(node.right):'  '.repeat(depth)+(node.operator==='and'?'ALL':'ANY')+'\n'+node.children.map((child)=>humanCondition(child,depth+1)).join('\n');}
function currentRule(){return{condition:ruleState.root,then:ruleState.then,else:ruleState.else};}
function previewCondition(){const readable=humanCondition(ruleState.root)+'\n\nTHEN\n'+(ruleState.then.map((action)=>'  • '+action.type).join('\n')||'  —')+'\n\nELSE\n'+(ruleState.else.map((action)=>'  • '+action.type).join('\n')||'  —');$('#conditionReadable').textContent=readable;$('#conditionJson').textContent=JSON.stringify(currentRule(),null,2);}
$('#addRootCondition').onclick=()=>{ruleState.root.children.push({type:'condition',left:'schedule.currentTime',operator:'gte',right:'15:00'});drawConditions();};$('#addRootGroup').onclick=()=>{ruleState.root.children.push({type:'group',operator:'or',children:[]});drawConditions();};$$('[data-add-action]').forEach((button)=>button.onclick=()=>{ruleState[button.dataset.addAction].push({type:button.dataset.addAction==='then'?'send_message':'skip'});drawActions(button.dataset.addAction);previewCondition();});
$$('[data-condition-tab]').forEach((button)=>button.onclick=()=>{$$('[data-condition-tab]').forEach((item)=>item.classList.remove('active'));button.classList.add('active');$('#conditionReadable').classList.toggle('hidden',button.dataset.conditionTab!=='readable');$('#conditionJson').classList.toggle('hidden',button.dataset.conditionTab!=='json');});
$('#validateCondition').onclick=async()=>{try{const result=await api('/api/rules/validate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(currentRule())});$('#conditionValidity').textContent=result.valid?'Rule is valid':result.errors.join(', ');notify(result.valid?'Condition rule is valid':'Condition rule needs attention',!result.valid);}catch(error){notify(error.message,true);}};

function renderPauseRules(){
  $('#pauseRules').innerHTML=pauseRules.length?pauseRules.map((rule,index)=>'<div class="list-row pause-row"><input data-pause-days="'+index+'" value="'+escapeHtml((rule.weekdays||[]).join(','))+'" placeholder="mon,tue,fri"><input type="time" data-pause-start="'+index+'" value="'+escapeHtml(rule.startTime||'')+'"><input type="time" data-pause-end="'+index+'" value="'+escapeHtml(rule.endTime||'')+'"><button class="btn icon danger" data-remove-pause="'+index+'">×</button></div>').join(''):'<div class="empty">No recurring pauses</div>';
  $$('[data-pause-days]').forEach((input)=>input.oninput=()=>pauseRules[Number(input.dataset.pauseDays)].weekdays=tags(input.value));
  $$('[data-pause-start]').forEach((input)=>input.oninput=()=>pauseRules[Number(input.dataset.pauseStart)].startTime=input.value);
  $$('[data-pause-end]').forEach((input)=>input.oninput=()=>pauseRules[Number(input.dataset.pauseEnd)].endTime=input.value);
  $$('[data-remove-pause]').forEach((button)=>button.onclick=()=>{pauseRules.splice(Number(button.dataset.removePause),1);renderPauseRules();});
}
function resetReminder(){state.editingReminder=null;$('#remEditorTitle').textContent='New reminder';$('#remName').value='';$('#remDescription').value='';$('#remPriority').value='normal';$('#remStart').value='14:00';$('#remStop').value='18:00';$('#remRepeat').value='30';$('#remTimezone').value='Asia/Qyzylorda';$('#remChecklist').checked=false;$('#remUseRule').checked=true;$('#remEnabled').checked=true;pauseRules=[];renderPauseRules();$$('#remDays input').forEach((input)=>input.checked=input.value==='fri');$$('#remTargets input').forEach((input)=>input.checked=false);}
function renderReminders(){
  $('#reminderRows').innerHTML=state.reminders.length?state.reminders.map((reminder)=>{const schedule=parse(reminder.schedule_json,{});return'<tr><td><strong>'+escapeHtml(reminder.name)+'</strong><div class="muted">'+escapeHtml(reminder.description||'')+'</div></td><td>'+badge(reminder.priority,reminder.priority==='critical'?'bad':reminder.priority==='high'?'warn':'')+'</td><td>'+escapeHtml((schedule.weekdays||[]).join(', ')+' · '+(schedule.startTime||'')+'–'+(schedule.stopTime||''))+'</td><td>'+(reminder.checklist_mode?badge('Checklist','info'):'—')+'</td><td>'+badge(reminder.enabled?'Enabled':'Disabled',reminder.enabled?'good':'')+'</td><td class="right"><button class="btn small" data-edit-reminder="'+reminder.id+'">Edit</button></td></tr>';}).join(''):emptyRow(6,'No reminders yet');
  $$('[data-edit-reminder]').forEach((button)=>button.onclick=()=>editReminder(button.dataset.editReminder));
}
function editReminder(id){const reminder=state.reminders.find((item)=>item.id===id);if(!reminder)return;state.editingReminder=id;$('#remEditorTitle').textContent='Edit reminder';$('#remName').value=reminder.name;$('#remDescription').value=reminder.description||'';$('#remPriority').value=reminder.priority;$('#remTemplate').value=reminder.template_id;$('#remWork').value=reminder.work_schedule_id||'';const schedule=parse(reminder.schedule_json,{});$('#remStart').value=schedule.startTime||'14:00';$('#remStop').value=schedule.stopTime||'18:00';$('#remRepeat').value=schedule.repeatEveryMinutes||30;$('#remTimezone').value=schedule.timezone||'Asia/Qyzylorda';$$('#remDays input').forEach((input)=>input.checked=(schedule.weekdays||[]).includes(input.value));const targetIds=String(reminder.target_ids_csv||'').split(',');$$('#remTargets input').forEach((input)=>input.checked=targetIds.includes(input.value));$('#remChecklist').checked=Boolean(reminder.checklist_mode);$('#remEnabled').checked=Boolean(reminder.enabled);pauseRules=parse(reminder.pause_rules_json,[]);renderPauseRules();const savedRule=parse(reminder.condition_rule_json,null);$('#remUseRule').checked=Boolean(savedRule);if(savedRule){ruleState.root=savedRule.condition;ruleState.then=savedRule.then||[];ruleState.else=savedRule.else||[];drawConditions();}showView('reminders');window.scrollTo({top:0,behavior:'smooth'});}
$('#newReminder').onclick=resetReminder;$('#cancelReminder').onclick=resetReminder;$('#addPauseRule').onclick=()=>{pauseRules.push({weekdays:['fri'],startTime:'13:00',endTime:'14:00'});renderPauseRules();};
$('#saveReminder').onclick=async()=>{try{const targetIds=$$('#remTargets input:checked').map((input)=>input.value);const weekdays=$$('#remDays input:checked').map((input)=>input.value);const body={name:$('#remName').value,description:$('#remDescription').value,template_id:$('#remTemplate').value,work_schedule_id:$('#remWork').value||null,priority:$('#remPriority').value,schedule:{kind:'weekly',weekdays,startTime:$('#remStart').value,stopTime:$('#remStop').value,repeatEveryMinutes:Number($('#remRepeat').value),timezone:$('#remTimezone').value},pauseRules,checklistMode:$('#remChecklist').checked,targetIds,conditionRule:$('#remUseRule').checked?currentRule():null,enabled:$('#remEnabled').checked};const url=state.editingReminder?'/api/reminders/'+state.editingReminder:'/api/reminders';await api(url,{method:state.editingReminder?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});notify(state.editingReminder?'Reminder updated':'Reminder created');resetReminder();await refreshAll();}catch(error){notify(error.message,true);}};

async function refreshRuns(){try{state.runs=await api('/api/runs');renderRuns();renderDashboard(await api('/api/dashboard'));}catch(error){notify(error.message,true);}}
function renderRuns(){const host=$('#runCards');if(!state.runs.length){host.innerHTML='<div class="card empty">No runs yet. Runs are created when the scheduler evaluates an active reminder window.</div>';return;}host.innerHTML=state.runs.map((run)=>'<div class="card run-card"><div class="run-top"><div><h2 class="card-title">'+escapeHtml(run.reminder_name)+'</h2><div class="run-meta">'+statusBadge(run.status)+badge(run.period_key,'')+badge('Attempt '+run.attempt,'')+(run.pause_until?badge('Paused until '+new Date(run.pause_until).toLocaleString(),'warn'):'')+'</div></div><div class="actions"><button class="btn small" data-checklist="'+run.id+'">Checklist</button><input type="datetime-local" data-pause-time="'+run.id+'" style="width:185px;min-height:30px"><button class="btn small" data-pause-run="'+run.id+'">Pause</button><button class="btn small" data-resume-run="'+run.id+'">Resume</button><button class="btn small danger" data-stop-run="'+run.id+'">Stop</button></div></div><div class="checklist hidden" id="checklist-'+run.id+'"></div></div>').join('');
  $$('[data-checklist]').forEach((button)=>button.onclick=()=>loadChecklist(button.dataset.checklist));
  $$('[data-pause-run]').forEach((button)=>button.onclick=async()=>{const input=$('[data-pause-time="'+button.dataset.pauseRun+'"]');const date=input.value?new Date(input.value):new Date(Date.now()+3600000);try{await api('/api/runs/'+button.dataset.pauseRun+'/pause',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({until:date.toISOString()})});notify('Run paused');await refreshRuns();}catch(error){notify(error.message,true);}});
  $$('[data-resume-run]').forEach((button)=>button.onclick=async()=>{try{await api('/api/runs/'+button.dataset.resumeRun+'/resume',{method:'POST'});notify('Run resumed');await refreshRuns();}catch(error){notify(error.message,true);}});
  $$('[data-stop-run]').forEach((button)=>button.onclick=async()=>{if(!confirm('Stop this run?'))return;try{await api('/api/runs/'+button.dataset.stopRun+'/stop',{method:'POST'});notify('Run stopped');await refreshRuns();}catch(error){notify(error.message,true);}});
}
async function loadChecklist(runId){try{const items=await api('/api/runs/'+runId+'/checklist');const host=$('#checklist-'+runId);host.classList.remove('hidden');host.innerHTML=items.length?items.map((item)=>'<div class="check-item"><div><strong>'+escapeHtml(item.label)+'</strong><div class="muted">'+escapeHtml(item.status)+'</div></div><button class="btn small" data-toggle-item="'+item.id+'">'+(item.status==='done'?'Mark pending':'Mark done')+'</button></div>').join(''):'<div class="empty">No checklist items</div>';$$('[data-toggle-item]',host).forEach((button)=>button.onclick=async()=>{try{await api('/api/checklist/'+button.dataset.toggleItem+'/toggle',{method:'POST'});await refreshRuns();}catch(error){notify(error.message,true);}});}catch(error){notify(error.message,true);}}
$('#refreshRuns').onclick=refreshRuns;

async function refreshDeliveries(){try{state.deliveries=await api('/api/deliveries');$('#deliveryRows').innerHTML=state.deliveries.length?state.deliveries.map((delivery)=>'<tr><td>'+escapeHtml(new Date(delivery.created_at+'Z').toLocaleString())+'</td><td>'+escapeHtml(delivery.reminder_name||'—')+'</td><td>'+escapeHtml(delivery.display_name||delivery.telegram_chat_id)+'</td><td>'+badge(delivery.status,delivery.status==='sent'?'good':'bad')+'</td><td title="'+escapeHtml(delivery.error||'')+'">'+escapeHtml(String(delivery.rendered_message||'').slice(0,100))+'</td></tr>').join(''):emptyRow(5,'No deliveries yet');}catch(error){notify(error.message,true);}}
$('#refreshDeliveries').onclick=refreshDeliveries;

function renderCommands(){const host=$('#commandRows');host.innerHTML=commands.length?commands.map((command,index)=>'<div class="list-row"><input data-command-name="'+index+'" value="'+escapeHtml(command.command||'')+'" placeholder="start"><input data-command-description="'+index+'" value="'+escapeHtml(command.description||'')+'" placeholder="Description"><button class="btn icon danger" data-remove-command="'+index+'">×</button></div>').join(''):'<div class="empty">No bot commands</div>';$$('[data-command-name]').forEach((input)=>input.oninput=()=>commands[Number(input.dataset.commandName)].command=input.value.replace(/^\//,''));$$('[data-command-description]').forEach((input)=>input.oninput=()=>commands[Number(input.dataset.commandDescription)].description=input.value);$$('[data-remove-command]').forEach((button)=>button.onclick=()=>{commands.splice(Number(button.dataset.removeCommand),1);renderCommands();});}
function renderBot(){const bot=state.bot;if(!bot)return;$('#botName').value=bot.name||'Cue';$('#botUsername').value=bot.username||'';$('#botParse').value=bot.default_parse_mode||'HTML';$('#botTimezone').value=bot.timezone||'Asia/Qyzylorda';$('#botEnabled').checked=Boolean(bot.is_enabled);commands=parse(bot.commands_json,[]);renderCommands();}
$('#addCommand').onclick=()=>{commands.push({command:'start',description:'Start the bot'});renderCommands();};
$('#saveBotConfig').onclick=async()=>{try{await api('/api/bot-config',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#botName').value,username:$('#botUsername').value,default_parse_mode:$('#botParse').value,timezone:$('#botTimezone').value,commands,is_enabled:$('#botEnabled').checked})});notify('Bot settings saved');await refreshAll();}catch(error){notify(error.message,true);}};
$('#syncCommands').onclick=async()=>{try{await api('/api/bot-config/sync-commands',{method:'POST'});notify('Commands synced to Telegram');}catch(error){notify(error.message,true);}};

$('#timesheetPreset').onclick=async()=>{try{const result=await api('/api/presets/timesheet',{method:'POST'});notify(result.created===false?'Timesheet preset already exists':'Timesheet preset created');await refreshAll();showView('reminders');}catch(error){notify(error.message,true);}};

async function refreshAll(){
  try {
    const results=await Promise.all([
      api('/api/dashboard'),api('/api/clients'),api('/api/templates'),api('/api/work-schedules'),api('/api/reminders'),api('/api/aliases'),api('/api/runs'),api('/api/runtime/status'),api('/api/bot-config')
    ]);
    const dashboard=results[0];state.clients=results[1];state.templates=results[2];state.works=results[3];state.reminders=results[4];state.aliases=results[5];state.runs=results[6];state.runtime=results[7];state.bot=results[8];
    fillSelect($('#remTemplate'),state.templates,'Select a message');fillSelect($('#remWork'),state.works,'Default / fallback');
    renderClients();renderAliases();renderTemplateList();renderWorkRows();renderReminders();renderRuns();renderReadiness();renderBot();renderDashboard(dashboard);drawConditions();renderMessagePreview();
  } catch(error) { notify(error.message,true); }
}

$('#remDays').innerHTML=days.map((day)=>'<label><input type="checkbox" value="'+day+'" '+(day==='fri'?'checked':'')+'>'+dayNames[day]+'</label>').join('');
const dayOptions=days.map((day)=>'<option value="'+day+'">'+dayNames[day]+'</option>').join('');$('#copyFrom').innerHTML=dayOptions;$('#copyTo').innerHTML=dayOptions;$('#copyTo').value='tue';$('#clearDay').innerHTML=dayOptions;
resetWork();resetClient();resetTemplate();resetReminder();drawConditions();renderCommands();
api('/api/work-schedules/seed-default',{method:'POST'}).then(refreshAll).catch((error)=>notify(error.message,true));
`;

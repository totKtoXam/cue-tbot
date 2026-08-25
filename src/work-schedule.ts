export type Weekday = 'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun';
export interface TimeInterval { start:string; end:string }
export interface WorkScheduleDefinition {
  timezone:string;
  weekly:Partial<Record<Weekday,TimeInterval[]>>;
  exceptions?:Array<{date:string;working:boolean;intervals?:TimeInterval[]}>;
}

function local(date:Date,timeZone:string){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(date);
  const m=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return {date:`${m.year}-${m.month}-${m.day}`,weekday:String(m.weekday).toLowerCase().slice(0,3) as Weekday,time:`${m.hour}:${m.minute}`};
}
export function isInsideInterval(time:string,i:TimeInterval){return time>=i.start&&time<=i.end}
export function resolveWorkSchedule(schedule:WorkScheduleDefinition,now=new Date()){
  const p=local(now,schedule.timezone);
  const exception=schedule.exceptions?.find(x=>x.date===p.date);
  const intervals=exception ? (exception.working ? (exception.intervals??[]) : []) : (schedule.weekly[p.weekday]??[]);
  const currentInterval=intervals.find(i=>isInsideInterval(p.time,i))??null;
  return {date:p.date,weekday:p.weekday,currentTime:p.time,isWorkingDay:intervals.length>0,isWorkingTime:Boolean(currentInterval),currentInterval};
}
export function defaultWorkSchedule(timezone='Asia/Qyzylorda'):WorkScheduleDefinition{
  const day=[{start:'09:00',end:'13:00'},{start:'14:00',end:'18:00'}];
  return {timezone,weekly:{mon:day,tue:day,wed:day,thu:day,fri:day,sat:[],sun:[]},exceptions:[]};
}

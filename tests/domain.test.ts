import { describe,it,expect } from 'vitest';
import { evaluateCondition, renderTemplate, resolveRule } from '../src/domain';

describe('condition engine',()=>{
  it('evaluates nested AND/OR groups',()=>{
    const rule:any={type:'group',operator:'and',children:[{type:'condition',left:'checklist.pendingCount',operator:'gt',right:0},{type:'group',operator:'or',children:[{type:'condition',left:'reminder.priority',operator:'eq',right:'critical'},{type:'condition',left:'system.currentTime',operator:'gte',right:'15:00'}]}]};
    expect(evaluateCondition(rule,{'checklist.pendingCount':2,'reminder.priority':'normal','system.currentTime':'16:00'})).toBe(true);
  });

  it('renders aliases',()=>{
    expect(renderTemplate('Hi {{client.name}}, {{count}} left',{'client.name':'Ada',count:2})).toBe('Hi Ada, 2 left');
  });

  it('selects THEN and ELSE actions from the evaluated condition',()=>{
    const rule:any={condition:{type:'condition',left:'checklist.pendingCount',operator:'gt',right:0},then:[{type:'send_message'}],else:[{type:'stop_run'}]};
    expect(resolveRule(rule,{'checklist.pendingCount':2}).actions).toEqual([{type:'send_message'}]);
    expect(resolveRule(rule,{'checklist.pendingCount':0}).actions).toEqual([{type:'stop_run'}]);
  });
});

import { describe, expect, it } from 'vitest';
import { renderTelegramControls } from '../src/telegram-controls';

describe('Telegram controls renderer', () => {
  it('binds checklist callbacks to the exact checklist item', () => {
    expect(renderTelegramControls(
      [{type:'callback',text:'Done',value:'checklist:done',row:0}],
      {},
      'chk_exact'
    )).toEqual({inline_keyboard:[[{text:'Done',callback_data:'checklist:done:chk_exact'}]]});
  });

  it('keeps multiple inline button rows and renders aliases', () => {
    expect(renderTelegramControls([
      {type:'url',text:'Open {{company}}',value:'https://example.com',row:0},
      {type:'callback',text:'Later',value:'pause:30',row:1}
    ],{company:'Cue'})).toEqual({inline_keyboard:[
      [{text:'Open Cue',url:'https://example.com'}],
      [{text:'Later',callback_data:'pause:30'}]
    ]});
  });

  it('falls back to a Done button for checklist messages', () => {
    expect(renderTelegramControls([],{},'chk_1')).toEqual({inline_keyboard:[[{text:'Done',callback_data:'checklist:done:chk_1'}]]});
  });
});

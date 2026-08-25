import { renderTemplate } from './domain';

export type TelegramControlType =
  | 'callback'
  | 'url'
  | 'reply'
  | 'command'
  | 'request_contact'
  | 'request_location'
  | 'web_app';

export interface TelegramControl {
  type: TelegramControlType;
  text: string;
  value?: string;
  row?: number;
}

export type TelegramReplyMarkup =
  | { inline_keyboard: Array<Array<Record<string, unknown>>> }
  | { keyboard: Array<Array<Record<string, unknown>>>; resize_keyboard: true; one_time_keyboard: false };

function groupRows<T>(controls: Array<{ row: number; value: T }>): T[][] {
  const grouped = new Map<number, T[]>();
  for (const control of controls) {
    const row = grouped.get(control.row) ?? [];
    row.push(control.value);
    grouped.set(control.row, row);
  }
  return [...grouped.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}

function callbackData(value: string, checklistItemId?: string): string {
  if (value === 'checklist:done' && checklistItemId) return `checklist:done:${checklistItemId}`;
  return value;
}

export function renderTelegramControls(
  controls: TelegramControl[],
  values: Record<string, unknown>,
  checklistItemId?: string
): TelegramReplyMarkup | undefined {
  const inline: Array<{ row: number; value: Record<string, unknown> }> = [];
  const reply: Array<{ row: number; value: Record<string, unknown> }> = [];

  for (const control of controls) {
    const text = renderTemplate(control.text, values).trim();
    const value = renderTemplate(control.value ?? '', values).trim();
    if (!text) continue;
    const row = Number.isInteger(control.row) ? Number(control.row) : 0;

    if (control.type === 'callback') {
      const data = callbackData(value || 'checklist:done', checklistItemId);
      if (new TextEncoder().encode(data).length <= 64) inline.push({ row, value: { text, callback_data: data } });
    } else if (control.type === 'url') {
      if (/^https:\/\//i.test(value)) inline.push({ row, value: { text, url: value } });
    } else if (control.type === 'web_app') {
      if (/^https:\/\//i.test(value)) inline.push({ row, value: { text, web_app: { url: value } } });
    } else if (control.type === 'request_contact') {
      reply.push({ row, value: { text, request_contact: true } });
    } else if (control.type === 'request_location') {
      reply.push({ row, value: { text, request_location: true } });
    } else if (control.type === 'command') {
      reply.push({ row, value: { text: value.startsWith('/') ? value : `/${value || text}` } });
    } else {
      reply.push({ row, value: { text } });
    }
  }

  if (inline.length) return { inline_keyboard: groupRows(inline) };
  if (reply.length) return { keyboard: groupRows(reply), resize_keyboard: true, one_time_keyboard: false };
  if (checklistItemId) {
    return { inline_keyboard: [[{ text: 'Done', callback_data: `checklist:done:${checklistItemId}` }]] };
  }
  return undefined;
}

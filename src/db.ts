export interface Env {
  DB: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  CRON_SECRET?: string;
  GOOGLE_CALENDAR_API_KEY?: string;
  GOOGLE_CALENDAR_ACCESS_TOKEN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REFRESH_TOKEN?: string;
  GOOGLE_CALENDAR_ID?: string;
  APP_TIMEZONE?: string;
}

export async function list<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}

export async function one<T>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return await db.prepare(sql).bind(...params).first<T>();
}

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`;
}

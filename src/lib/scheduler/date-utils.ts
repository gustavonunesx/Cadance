// Utilitários de data — código puro, sem fuso horário local (tudo em UTC)
// para evitar bugs de "dia errado" perto de meia-noite.

/** Converte 'YYYY-MM-DD' num timestamp UTC (meio-dia, só pra aritmética). */
function toUtcTimestamp(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Converte um timestamp UTC de volta para 'YYYY-MM-DD'. */
function fromUtcTimestamp(ts: number): string {
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Soma `days` dias a uma data 'YYYY-MM-DD'. */
export function addDays(date: string, days: number): string {
  return fromUtcTimestamp(toUtcTimestamp(date) + days * MS_PER_DAY);
}

/** Dia da semana (0=domingo ... 6=sábado) de uma data 'YYYY-MM-DD'. */
export function weekdayOf(date: string): number {
  return new Date(toUtcTimestamp(date)).getUTCDay();
}

/** Diferença em dias (b - a) entre duas datas 'YYYY-MM-DD'. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcTimestamp(b) - toUtcTimestamp(a)) / MS_PER_DAY);
}

/** Compara duas datas 'YYYY-MM-DD' (funciona com comparação de string,
 * mas deixamos explícito pra clareza de intenção no resto do código). */
export function isBefore(a: string, b: string): boolean {
  return a < b;
}

export function isAfter(a: string, b: string): boolean {
  return a > b;
}

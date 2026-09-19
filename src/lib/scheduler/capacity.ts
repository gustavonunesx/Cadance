import type { AvailabilitySlot, Period } from './types';

/** Ordem cronológica de preenchimento — nunca reordenar (scheduler-spec §5). */
export const PERIODS: readonly Period[] = ['manha', 'tarde', 'noite'];

const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' -> timestamp UTC. Nunca usa o fuso da máquina. */
function toUtc(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtc(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** 0=domingo ... 6=sábado. */
export function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * MS_PER_DAY);
}

/** Dias inteiros de `from` até `to`; negativo se `to` já passou. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

/**
 * Capacidade usável de um período num dia, já com a folga de segurança
 * descontada. É aqui que o buffer vive: o resto do algoritmo só preenche
 * capacidade, então nenhum período jamais passa de 100% (scheduler-spec §4.1).
 */
export function effectiveCapacity(
  date: string,
  period: Period,
  availability: AvailabilitySlot[],
  bufferPct: number,
): number {
  const weekday = weekdayOf(date);
  const slot = availability.find((s) => s.weekday === weekday && s.period === period);
  if (!slot) return 0;
  return Math.floor(slot.hours * 60 * (1 - bufferPct));
}

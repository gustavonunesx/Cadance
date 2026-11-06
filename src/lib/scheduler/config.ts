import type { SchedulerConfig } from './types';

/** Valores padrão da scheduler-spec §3 — a folga de 20% é o buffer de segurança. */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  bufferPct: 0.2,
  minBlockMinutes: 15,
  maxHorizonDays: 365,
};

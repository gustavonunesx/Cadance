import type { ScheduleBlock } from './types';

/**
 * v2 — troca de período tarefas `pesada` com tarefas `leve` do mesmo dia,
 * quando isso não muda o dia de nenhuma tarefa.
 *
 * Adiado de propósito (scheduler-spec §9): peak matching compete com o
 * earliest-deadline-first e, mal feito, empurra tarefa urgente para depois,
 * furando prazo. A assinatura fica pronta; o MVP devolve o plano intacto.
 */
export function preferPeakForHeavy(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return blocks;
}

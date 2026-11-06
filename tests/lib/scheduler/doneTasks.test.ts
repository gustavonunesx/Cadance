import { describe, it, expect } from 'vitest';
import { DEFAULT_SCHEDULER_CONFIG, generateSchedule } from '@/lib/scheduler';
import type { AvailabilitySlot, Project, Task } from '@/lib/scheduler';

function availabilityEveryDay(manha: number, tarde: number, noite: number): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    slots.push({ weekday, period: 'manha', hours: manha, isPeak: false });
    slots.push({ weekday, period: 'tarde', hours: tarde, isPeak: false });
    slots.push({ weekday, period: 'noite', hours: noite, isPeak: false });
  }
  return slots;
}

function task(
  id: string,
  projectId: string,
  orderIndex: number,
  estimatedMinutes: number,
  opts: { actualMinutes?: number; done?: boolean; needsClarification?: boolean } = {},
): Task {
  return {
    id,
    projectId,
    orderIndex,
    estimatedMinutes,
    actualMinutes: opts.actualMinutes ?? 0,
    difficulty: 'media',
    done: opts.done ?? false,
    needsClarification: opts.needsClarification,
  };
}

function project(id: string, deadline: string | null, tasks: Task[]): Project {
  return { id, deadline, priority: 'alta', createdAt: '2026-01-01', tasks };
}

// ---------------------------------------------------------------------------
// scheduler-spec §4.2 — tarefa `done` é ignorada, sobre o que for o restante
// ---------------------------------------------------------------------------

describe('tarefas concluídas (done) não geram deficit', () => {
  it('concluída mais rápido que o estimado não torna o projeto inviável', () => {
    // D: estimada 120, só 30 gastos, marcada concluída (restante bruto = 90, que
    // nunca será alocado). T: 60 min, cabe folgado em D1 antes do prazo.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', '2026-08-25', [
          task('D', 'P', 0, 120, { actualMinutes: 30, done: true }),
          task('T', 'P', 1, 60),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toEqual([]);
    // Blocos só da tarefa pendente: manhã 48 + tarde 12 (a fração final conclui).
    expect(result.blocks).toEqual([
      { taskId: 'T', date: '2026-08-19', period: 'manha', minutes: 48 },
      { taskId: 'T', date: '2026-08-19', period: 'tarde', minutes: 12 },
    ]);
  });

  it('concluída e também sem estimativa não vira alerta nem deficit', () => {
    // X foi marcada sem estimativa pela IA, mas o usuário a concluiu: não há o
    // que perguntar (unestimatedTasks) nem o que somar (deficit).
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', '2026-08-25', [
          task('X', 'P', 0, 90, { done: true, needsClarification: true }),
          task('T', 'P', 1, 60),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    expect(result.unestimatedTasks).toEqual([]);
    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toEqual([]);
    expect(result.blocks.some((block) => block.taskId === 'X')).toBe(false);
  });
});

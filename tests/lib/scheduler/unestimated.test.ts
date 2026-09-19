import { describe, it, expect } from 'vitest';
import { generateSchedule, preferPeakForHeavy } from '@/lib/scheduler';
import type {
  AvailabilitySlot,
  Project,
  ScheduleBlock,
  SchedulerConfig,
  Task,
} from '@/lib/scheduler';

const DEFAULT_CONFIG: SchedulerConfig = {
  bufferPct: 0.2,
  minBlockMinutes: 15,
  maxHorizonDays: 365,
};

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
  opts: { needsClarification?: boolean } = {},
): Task {
  return {
    id,
    projectId,
    orderIndex,
    estimatedMinutes,
    actualMinutes: 0,
    difficulty: 'media',
    done: false,
    needsClarification: opts.needsClarification,
  };
}

function project(id: string, deadline: string | null, tasks: Task[]): Project {
  return { id, deadline, priority: 'media', createdAt: '2026-01-01', tasks };
}

describe('tarefas sem estimativa (needsClarification)', () => {
  it('não gera bloco e entra em unestimatedTasks', () => {
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', null, [
          task('OK', 'P', 0, 60),
          task('FLAG', 'P', 1, 60, { needsClarification: true }),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_CONFIG,
    });

    expect(result.blocks.some((b) => b.taskId === 'FLAG')).toBe(false);
    expect(result.unestimatedTasks).toEqual(['FLAG']);
  });

  it('não bloqueia as tarefas seguintes do mesmo projeto', () => {
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', null, [
          task('FLAG', 'P', 0, 60, { needsClarification: true }),
          task('DEPOIS', 'P', 1, 60),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_CONFIG,
    });

    const total = result.blocks
      .filter((b) => b.taskId === 'DEPOIS')
      .reduce((sum, b) => sum + b.minutes, 0);
    expect(total).toBe(60);
  });

  it('não entra no cálculo de deficit — o plano continua viável', () => {
    // 60 min cabem folgados até o prazo; os 999 flagueados são ignorados.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', '2026-08-25', [
          task('OK', 'P', 0, 60),
          task('FLAG', 'P', 1, 999, { needsClarification: true }),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_CONFIG,
    });

    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toHaveLength(0);
    expect(result.unestimatedTasks).toEqual(['FLAG']);
  });

  it('unestimatedTasks é vazio quando nenhuma tarefa está flagueada', () => {
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', null, [task('OK', 'P', 0, 60)])],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_CONFIG,
    });
    expect(result.unestimatedTasks).toEqual([]);
  });
});

describe('preferPeakForHeavy (stub v2)', () => {
  it('existe e devolve os blocos sem alterar (peak matching é v2)', () => {
    const blocks: ScheduleBlock[] = [
      { taskId: 'T', date: '2026-08-19', period: 'manha', minutes: 48 },
    ];
    expect(preferPeakForHeavy(blocks)).toEqual(blocks);
  });
});

import { describe, it, expect } from 'vitest';
import { generateSchedule } from '@/lib/scheduler';
import type {
  AvailabilitySlot,
  Project,
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

function task(id: string, projectId: string, estimatedMinutes: number): Task {
  return {
    id,
    projectId,
    orderIndex: 0,
    estimatedMinutes,
    actualMinutes: 0,
    difficulty: 'media',
    done: false,
  };
}

function project(id: string, deadline: string | null, tasks: Task[]): Project {
  return { id, deadline, priority: 'alta', createdAt: '2026-01-01', tasks };
}

// ---------------------------------------------------------------------------
// §10.7 — prazo exatamente no limite
// ---------------------------------------------------------------------------

describe('§10.7 — prazo exatamente no limite', () => {
  it('é viável quando o trabalho fecha no último dia do prazo, sem folga', () => {
    // Só manhã: 48 min/dia. 96 min = exatamente D1 + D2. Prazo em D2.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', '2026-08-20', [task('T', 'P', 96)])],
      availability: availabilityEveryDay(1, 0, 0),
      config: DEFAULT_CONFIG,
    });

    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toHaveLength(0);
    expect(result.projectedCompletion['P']).toBe('2026-08-20');
    // Nenhum bloco depois do prazo.
    for (const block of result.blocks) {
      expect(block.date <= '2026-08-20').toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ceil() em adicionarMinutosPorDia
// ---------------------------------------------------------------------------

describe('adicionarMinutosPorDia arredonda para cima', () => {
  it('usa ceil quando o deficit não divide igual pelos dias disponíveis', () => {
    // Só manhã (48/dia), 200 min, prazo em D3.
    // Aloca 48 em D1..D4 (192) + 8 em D5 (conclui, passa no anti-sliver).
    // Depois do prazo: 48 (D4) + 8 (D5) = 56. diasDisponiveis = 3.
    // 56/3 = 18.67 -> ceil = 19 (floor daria 18).
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', '2026-08-21', [task('T', 'P', 200)])],
      availability: availabilityEveryDay(1, 0, 0),
      config: DEFAULT_CONFIG,
    });

    expect(result.feasible).toBe(false);
    const infeasible = result.infeasibleProjects[0];
    expect(infeasible.deficitMinutes).toBe(56);
    expect(infeasible.options.adicionarMinutosPorDia).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// maxHorizonDays
// ---------------------------------------------------------------------------

describe('maxHorizonDays', () => {
  it('para o laço no horizonte e não agenda além dele', () => {
    // Horizonte de 2 dias, tarefa gigante: nada pode cair depois de D3.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', null, [task('T', 'P', 100000)])],
      availability: availabilityEveryDay(1, 2, 3),
      config: { ...DEFAULT_CONFIG, maxHorizonDays: 2 },
    });

    expect(result.blocks.length).toBeGreaterThan(0);
    for (const block of result.blocks) {
      expect(block.date <= '2026-08-21').toBe(true);
    }
  });

  it('o que não coube no horizonte vira deficit num projeto com prazo', () => {
    // Horizonte 0 => só D1 (288 min de capacidade). Tarefa de 500.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', '2026-12-31', [task('T', 'P', 500)])],
      availability: availabilityEveryDay(1, 2, 3),
      config: { ...DEFAULT_CONFIG, maxHorizonDays: 0 },
    });

    const allocated = result.blocks.reduce((sum, b) => sum + b.minutes, 0);
    expect(allocated).toBe(288);
    expect(result.feasible).toBe(false);
    expect(result.infeasibleProjects[0].deficitMinutes).toBe(212);
  });
});

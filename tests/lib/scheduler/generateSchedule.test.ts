// tests/lib/scheduler/generateSchedule.test.ts
//
// Testes do algoritmo de distribuição do Cadence.
// Baseados 1:1 no scheduler-spec.md (seções 11 e 12).
//
// Colocar em: tests/lib/scheduler/generateSchedule.test.ts
// Requer que o alias "@" aponte para /src no vitest.config (padrão Next.js).
// A implementação deve exportar `generateSchedule` e os tipos de @/lib/scheduler.

import { describe, it, expect } from 'vitest';
import { DEFAULT_SCHEDULER_CONFIG, generateSchedule } from '@/lib/scheduler';
import type {
  Period,
  Priority,
  Difficulty,
  Task,
  Project,
  AvailabilitySlot,
  ScheduleBlock,
  SchedulerInput,
} from '@/lib/scheduler';

// ---------------------------------------------------------------------------
// Helpers de construção (deixam os testes legíveis)
// ---------------------------------------------------------------------------

/** Mesma disponibilidade em todos os 7 dias da semana. */
function availabilityEveryDay(
  manha: number,
  tarde: number,
  noite: number,
  peak?: Period,
): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    slots.push({ weekday, period: 'manha', hours: manha, isPeak: peak === 'manha' });
    slots.push({ weekday, period: 'tarde', hours: tarde, isPeak: peak === 'tarde' });
    slots.push({ weekday, period: 'noite', hours: noite, isPeak: peak === 'noite' });
  }
  return slots;
}

function task(
  id: string,
  projectId: string,
  orderIndex: number,
  estimatedMinutes: number,
  opts: { actualMinutes?: number; difficulty?: Difficulty; done?: boolean } = {},
): Task {
  return {
    id,
    projectId,
    orderIndex,
    estimatedMinutes,
    actualMinutes: opts.actualMinutes ?? 0,
    difficulty: opts.difficulty ?? 'media',
    done: opts.done ?? false,
  };
}

function project(
  id: string,
  deadline: string | null,
  priority: Priority,
  tasks: Task[],
  createdAt = '2026-01-01',
): Project {
  return { id, deadline, priority, createdAt, tasks };
}

// Capacidades efetivas para 1h/2h/3h com buffer 20% (usadas nos exemplos)
const CAP = { manha: 48, tarde: 96, noite: 144 } as const;

/** Soma de minutos por (date+period) para checar limite de capacidade. */
function minutesByDatePeriod(blocks: ScheduleBlock[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of blocks) {
    const key = `${b.date}|${b.period}`;
    m.set(key, (m.get(key) ?? 0) + b.minutes);
  }
  return m;
}

/** Soma de minutos por tarefa. */
function minutesByTask(blocks: ScheduleBlock[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of blocks) m.set(b.taskId, (m.get(b.taskId) ?? 0) + b.minutes);
  return m;
}

/** Ordenação canônica pra comparar conteúdo sem depender da ordem de push. */
function canonical(blocks: ScheduleBlock[]): ScheduleBlock[] {
  const periodRank: Record<Period, number> = { manha: 0, tarde: 1, noite: 2 };
  return [...blocks].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      periodRank[a.period] - periodRank[b.period] ||
      a.taskId.localeCompare(b.taskId) ||
      a.minutes - b.minutes,
  );
}

/** Congela o valor e tudo que ele contém: qualquer escrita na entrada lança TypeError. */
function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}

// ---------------------------------------------------------------------------
// 1. Capacidade efetiva aplica o buffer
// ---------------------------------------------------------------------------

describe('capacidade efetiva e buffer', () => {
  it('nunca aloca mais que a capacidade efetiva (2h tarde, buffer 20% => 96 max)', () => {
    // Só há tarde disponível; tarefa gigante força o preenchimento máximo.
    const availability = availabilityEveryDay(0, 2, 0);
    const projects = [
      project('P', '2026-12-31', 'alta', [task('T', 'P', 0, 5000)]),
    ];

    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    // 5000 min / 96 = 52 tardes cheias (4992) + 8 min na 53ª (2026-10-10), que
    // conclui a tarefa. Cada tarde sai em exatamente 96 — nunca 120 (100% das 2h).
    const used = minutesByDatePeriod(result.blocks);
    expect(used.size).toBe(53);
    for (const [key, minutes] of used) {
      expect(key.endsWith('|tarde')).toBe(true); // manhã e noite não têm capacidade
      expect(minutes).toBe(key === '2026-10-10|tarde' ? 8 : 96);
    }
  });

  it('nenhum período em nenhum dia ultrapassa sua capacidade efetiva', () => {
    const availability = availabilityEveryDay(1, 2, 3);
    const projects = [
      project('P', '2026-12-31', 'alta', [task('T', 'P', 0, 4000)]),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    // 4000 min = 13 dias cheios (13 × 288 = 3744) + 256 no 14º dia (48 + 96 + 112):
    // 14 × 3 períodos, todos na capacidade efetiva exata, menos a última noite.
    const used = minutesByDatePeriod(result.blocks);
    expect(used.size).toBe(42);
    for (const [key, minutes] of used) {
      const period = key.split('|')[1] as Period;
      expect(minutes).toBe(key === '2026-09-01|noite' ? 112 : CAP[period]);
    }
  });

  it.each([
    { bufferPct: 0.2, dia1: 96, dia2: 24 },
    { bufferPct: 0.15, dia1: 102, dia2: 18 },
  ])(
    'tarefa de 120 min numa tarde de 2h com folga $bufferPct => $dia1 + $dia2',
    ({ bufferPct, dia1, dia2 }) => {
      // Sem a folga, 120 min cairiam em exatamente 100% da tarde de 2h.
      const availability = availabilityEveryDay(0, 2, 0);
      const projects = [project('P', null, 'media', [task('T', 'P', 0, 120)])];
      const result = generateSchedule({
        today: '2026-08-19',
        projects,
        availability,
        config: { ...DEFAULT_SCHEDULER_CONFIG, bufferPct },
      });

      expect(canonical(result.blocks)).toEqual([
        { taskId: 'T', date: '2026-08-19', period: 'tarde', minutes: dia1 },
        { taskId: 'T', date: '2026-08-20', period: 'tarde', minutes: dia2 },
      ]);
    },
  );
});

// ---------------------------------------------------------------------------
// 2. Divisão de tarefas e ordem interna do projeto
// ---------------------------------------------------------------------------

describe('divisão de tarefas e ordem do passo a passo', () => {
  it('divide uma tarefa maior que um período entre períodos/dias', () => {
    const availability = availabilityEveryDay(1, 2, 3);
    const projects = [project('P', null, 'media', [task('T', 'P', 0, 300)])];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    // 300 min não cabem num período só -> mais de um bloco.
    expect(result.blocks.length).toBeGreaterThan(1);
    // Soma dos blocos == duração da tarefa.
    expect(minutesByTask(result.blocks).get('T')).toBe(300);
  });

  it('nunca começa a tarefa 2 de um projeto antes de terminar a tarefa 1', () => {
    const availability = availabilityEveryDay(1, 2, 3);
    const projects = [
      project('P', '2026-12-31', 'alta', [
        task('A1', 'P', 0, 180),
        task('A2', 'P', 1, 120),
      ]),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    const ordered = canonical(result.blocks);
    const firstA2 = ordered.findIndex((b) => b.taskId === 'A2');
    const lastA1 = ordered.map((b) => b.taskId).lastIndexOf('A1');
    // O último pedaço de A1 vem antes (ou no mesmo slot) do primeiro de A2.
    expect(lastA1).toBeLessThan(firstA2);
  });
});

// ---------------------------------------------------------------------------
// 3. Earliest-deadline-first e desempates
// ---------------------------------------------------------------------------

describe('ordenação de urgência (EDF e desempates)', () => {
  it('prazo mais próximo é alocado primeiro, mesmo com prioridade menor', () => {
    const availability = availabilityEveryDay(1, 0, 0); // pouca capacidade: força competição
    const projects = [
      project('LONGE', '2026-09-30', 'alta', [task('L', 'LONGE', 0, 48)]),
      project('PERTO', '2026-08-25', 'baixa', [task('P', 'PERTO', 0, 48)]),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    const first = canonical(result.blocks)[0];
    expect(first.taskId).toBe('P'); // PERTO ganha por prazo, apesar da prioridade baixa
  });

  it('mesmo prazo: prioridade desempata (alta antes de baixa)', () => {
    const availability = availabilityEveryDay(1, 0, 0);
    const projects = [
      project('B', '2026-08-25', 'baixa', [task('TB', 'B', 0, 48)], '2026-01-01'),
      project('A', '2026-08-25', 'alta', [task('TA', 'A', 0, 48)], '2026-01-01'),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });
    expect(canonical(result.blocks)[0].taskId).toBe('TA');
  });

  it('mesmo prazo e prioridade: createdAt mais antigo desempata', () => {
    const availability = availabilityEveryDay(1, 0, 0);
    const projects = [
      project('NOVO', '2026-08-25', 'media', [task('TN', 'NOVO', 0, 48)], '2026-05-01'),
      project('VELHO', '2026-08-25', 'media', [task('TV', 'VELHO', 0, 48)], '2026-02-01'),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });
    expect(canonical(result.blocks)[0].taskId).toBe('TV');
  });

  it('projeto com prazo vem antes de projeto sem prazo', () => {
    const availability = availabilityEveryDay(1, 0, 0);
    const projects = [
      project('SEM', null, 'alta', [task('S', 'SEM', 0, 48)]),
      project('COM', '2026-09-30', 'baixa', [task('C', 'COM', 0, 48)]),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });
    expect(canonical(result.blocks)[0].taskId).toBe('C');
  });
});

// ---------------------------------------------------------------------------
// 4. Guarda anti-sliver
// ---------------------------------------------------------------------------

describe('guarda anti-sliver', () => {
  it('não cria bloco menor que minBlock quando ele NÃO conclui a tarefa', () => {
    // manha cap 48: T1=40 (sobra 8). T2 precisa de 30 -> não pode virar bloco de 8.
    const availability = availabilityEveryDay(1, 0, 0);
    const projects = [
      project('P', '2026-12-31', 'alta', [
        task('T1', 'P', 0, 40),
        task('T2', 'P', 1, 30),
      ]),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    // Nenhum bloco de T2 com menos de 15 min (o sliver de 8 não pode existir).
    for (const b of result.blocks) {
      if (b.taskId === 'T2') expect(b.minutes).toBeGreaterThanOrEqual(15);
    }
    // T2 só começa no dia seguinte (não coube no resto do dia 1).
    const t2Dates = result.blocks.filter((b) => b.taskId === 'T2').map((b) => b.date);
    expect(t2Dates).not.toContain('2026-08-19');
  });

  it('permite fração final < minBlock quando ela conclui a tarefa', () => {
    // Tarefa de 12 min (menor que minBlock) deve ser alocada, pois conclui.
    const availability = availabilityEveryDay(1, 0, 0);
    const projects = [project('P', null, 'media', [task('T', 'P', 0, 12)])];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });
    expect(minutesByTask(result.blocks).get('T')).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// 5. Exemplo A do spec (feasible) — reprodução exata
// ---------------------------------------------------------------------------

describe('Exemplo A do spec — cabe no prazo', () => {
  const availability = availabilityEveryDay(1, 2, 3, 'noite');
  const projects = [
    project('A', '2026-08-21', 'alta', [
      task('A1', 'A', 0, 180),
      task('A2', 'A', 1, 120),
    ]),
    project('B', null, 'media', [task('B1', 'B', 0, 90)]),
  ];

  const result = generateSchedule({
    today: '2026-08-19',
    projects,
    availability,
    config: DEFAULT_SCHEDULER_CONFIG,
  });

  it('é viável', () => {
    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toHaveLength(0);
  });

  it('reproduz exatamente os blocos esperados', () => {
    const expected: ScheduleBlock[] = [
      { taskId: 'A1', date: '2026-08-19', period: 'manha', minutes: 48 },
      { taskId: 'A1', date: '2026-08-19', period: 'tarde', minutes: 96 },
      { taskId: 'A1', date: '2026-08-19', period: 'noite', minutes: 36 },
      { taskId: 'A2', date: '2026-08-19', period: 'noite', minutes: 108 },
      { taskId: 'A2', date: '2026-08-20', period: 'manha', minutes: 12 },
      { taskId: 'B1', date: '2026-08-20', period: 'manha', minutes: 36 },
      { taskId: 'B1', date: '2026-08-20', period: 'tarde', minutes: 54 },
    ];
    expect(canonical(result.blocks)).toEqual(canonical(expected));
  });

  it('totais por tarefa batem com as estimativas', () => {
    const byTask = minutesByTask(result.blocks);
    expect(byTask.get('A1')).toBe(180);
    expect(byTask.get('A2')).toBe(120);
    expect(byTask.get('B1')).toBe(90);
  });

  it('projeta término de A e B em 2026-08-20 (antes do prazo)', () => {
    expect(result.projectedCompletion['A']).toBe('2026-08-20');
    expect(result.projectedCompletion['B']).toBe('2026-08-20');
  });
});

// ---------------------------------------------------------------------------
// 6. Exemplo B do spec (infeasible) — deficit e 3 saídas
// ---------------------------------------------------------------------------

describe('Exemplo B do spec — não cabe no prazo', () => {
  const availability = availabilityEveryDay(1, 2, 3);
  const projects = [
    project('C', '2026-08-19', 'alta', [task('C1', 'C', 0, 400)]),
  ];

  const result = generateSchedule({
    today: '2026-08-19',
    projects,
    availability,
    config: DEFAULT_SCHEDULER_CONFIG,
  });

  it('marca inviável com deficit de 112 min', () => {
    expect(result.feasible).toBe(false);
    expect(result.infeasibleProjects).toHaveLength(1);
    expect(result.infeasibleProjects[0].projectId).toBe('C');
    expect(result.infeasibleProjects[0].deficitMinutes).toBe(112);
  });

  it('calcula as 3 saídas corretamente', () => {
    const opts = result.infeasibleProjects[0].options;
    expect(opts.esticarPrazoAte).toBe('2026-08-20');
    expect(opts.adicionarMinutosPorDia).toBe(112);
    expect(opts.cortarEscopoMinutos).toBe(112);
  });

  it('mesmo inviável, entrega o melhor plano possível (aloca tudo)', () => {
    expect(minutesByTask(result.blocks).get('C1')).toBe(400);
  });

  it('reproduz os blocos do spec e conclui em D2', () => {
    const expected: ScheduleBlock[] = [
      { taskId: 'C1', date: '2026-08-19', period: 'manha', minutes: 48 },
      { taskId: 'C1', date: '2026-08-19', period: 'tarde', minutes: 96 },
      { taskId: 'C1', date: '2026-08-19', period: 'noite', minutes: 144 },
      { taskId: 'C1', date: '2026-08-20', period: 'manha', minutes: 48 },
      { taskId: 'C1', date: '2026-08-20', period: 'tarde', minutes: 64 },
    ];
    expect(canonical(result.blocks)).toEqual(canonical(expected));
    expect(result.projectedCompletion['C']).toBe('2026-08-20');
  });
});

// ---------------------------------------------------------------------------
// 7. Replanejamento = rodar o mesmo algoritmo com estado atualizado
// ---------------------------------------------------------------------------

describe('replanejamento', () => {
  it('desconta o já feito e não agenda tarefa concluída', () => {
    // A1 concluída (done). today avançou 1 dia. Só A2 e B1 devem sobrar.
    const availability = availabilityEveryDay(1, 2, 3);
    const projects = [
      project('A', '2026-08-25', 'alta', [
        task('A1', 'A', 0, 180, { actualMinutes: 180, done: true }),
        task('A2', 'A', 1, 120),
      ]),
      project('B', null, 'media', [task('B1', 'B', 0, 90)]),
    ];

    const result = generateSchedule({
      today: '2026-08-20',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    // Nenhum bloco de A1 (já concluída).
    expect(result.blocks.some((b) => b.taskId === 'A1')).toBe(false);
    // A2 e B1 aparecem com seus minutos cheios.
    expect(minutesByTask(result.blocks).get('A2')).toBe(120);
    expect(minutesByTask(result.blocks).get('B1')).toBe(90);
  });

  it('nunca agenda em datas passadas (só de hoje pra frente)', () => {
    const availability = availabilityEveryDay(1, 2, 3);
    const projects = [project('P', null, 'media', [task('T', 'P', 0, 200)])];
    const today = '2026-08-20';
    const result = generateSchedule({
      today,
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });
    // Sem esta checagem o laço abaixo passaria vazio se nenhum bloco fosse gerado.
    expect(result.blocks).toHaveLength(3);
    for (const b of result.blocks) {
      expect(b.date >= today).toBe(true);
    }
  });

  it('com progresso parcial, aloca só o restante a partir de hoje', () => {
    // 120 estimados - 45 feitos = 75 restantes; a manhã rende 48 por dia.
    const availability = availabilityEveryDay(1, 0, 0);
    const projects = [
      project(
        'P',
        '2026-08-31',
        'alta',
        [task('T', 'P', 0, 120, { actualMinutes: 45 })],
        '2026-08-01',
      ),
    ];
    const result = generateSchedule({
      today: '2026-08-20',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    expect(canonical(result.blocks)).toEqual([
      { taskId: 'T', date: '2026-08-20', period: 'manha', minutes: 48 },
      { taskId: 'T', date: '2026-08-21', period: 'manha', minutes: 27 },
    ]);
    expect(minutesByTask(result.blocks).get('T')).toBe(75);
    expect(result.projectedCompletion['P']).toBe('2026-08-21');
  });
});

// ---------------------------------------------------------------------------
// 8. Casos de borda (seção 10 do spec)
// ---------------------------------------------------------------------------

describe('casos de borda', () => {
  it('sem disponibilidade nenhuma: blocks vazio e projeto com prazo inviável', () => {
    const availability = availabilityEveryDay(0, 0, 0);
    const projects = [
      project('P', '2026-08-25', 'alta', [task('T', 'P', 0, 60)]),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });
    expect(result.blocks).toHaveLength(0);
    expect(result.feasible).toBe(false);
    expect(result.infeasibleProjects[0].deficitMinutes).toBe(60);
  });

  it('sem prazo e sem disponibilidade: plano vazio, viável e sem data de término', () => {
    const availability: AvailabilitySlot[] = [];
    const projects = [project('P', null, 'media', [task('T', 'P', 0, 60)])];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });
    expect(result.blocks).toEqual([]);
    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toEqual([]);
    expect(result.projectedCompletion).toEqual({});
  });

  it('prazo no passado: imediatamente inviável com deficit = total', () => {
    const availability = availabilityEveryDay(1, 2, 3);
    const projects = [
      project('P', '2026-08-10', 'alta', [task('T', 'P', 0, 100)]),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });
    expect(result.feasible).toBe(false);
    expect(result.infeasibleProjects[0].deficitMinutes).toBe(100);
  });

  it('actualMinutes >= estimatedMinutes: tarefa não gera bloco', () => {
    const availability = availabilityEveryDay(1, 2, 3);
    const projects = [
      project('P', null, 'media', [
        task('T', 'P', 0, 100, { actualMinutes: 100 }),
      ]),
    ];
    const result = generateSchedule({
      today: '2026-08-19',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });
    expect(result.blocks.some((b) => b.taskId === 'T')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Disponibilidade só em alguns dias da semana
// ---------------------------------------------------------------------------

describe('disponibilidade em dias da semana alternados', () => {
  it('hoje é sexta sem disponibilidade: o primeiro bloco cai na próxima segunda e nenhum em dia excluído', () => {
    // Só segunda (1) e quarta (3), 48 min cada manhã. 2026-08-21 é sexta (5).
    const availability = availabilityEveryDay(1, 0, 0).filter(
      (slot) => slot.weekday === 1 || slot.weekday === 3,
    );
    const projects = [project('P', null, 'media', [task('T', 'P', 0, 100)])];
    const result = generateSchedule({
      today: '2026-08-21',
      projects,
      availability,
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    expect(canonical(result.blocks)).toEqual([
      { taskId: 'T', date: '2026-08-24', period: 'manha', minutes: 48 }, // segunda
      { taskId: 'T', date: '2026-08-26', period: 'manha', minutes: 48 }, // quarta
      { taskId: 'T', date: '2026-08-31', period: 'manha', minutes: 4 }, // segunda (4 < 15, mas conclui)
    ]);
  });
});

// ---------------------------------------------------------------------------
// 10. A entrada nunca é mutada (spec §1 e §5)
// ---------------------------------------------------------------------------

describe('imutabilidade da entrada', () => {
  it('roda com a entrada congelada em profundidade e a deixa idêntica', () => {
    // Cobre os caminhos de alocação, tarefa concluída e inviabilidade (C estoura o prazo).
    const input: SchedulerInput = {
      today: '2026-08-19',
      projects: [
        project('A', '2026-08-21', 'alta', [
          task('A1', 'A', 0, 180, { actualMinutes: 30 }),
          task('A2', 'A', 1, 120),
        ]),
        project('B', null, 'media', [
          task('B1', 'B', 0, 40, { actualMinutes: 40, done: true }),
          task('B2', 'B', 1, 90),
        ]),
        project('C', '2026-08-19', 'baixa', [task('C1', 'C', 0, 500)]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      // Cópia: congelar a entrada não pode congelar a constante compartilhada.
      config: { ...DEFAULT_SCHEDULER_CONFIG },
    };
    const before = structuredClone(input);
    deepFreeze(input);

    expect(() => generateSchedule(input)).not.toThrow();
    expect(input).toEqual(before);
  });
});

import { describe, it, expect } from 'vitest';
import {
  remainingMinutes,
  isEligible,
  rankProjects,
  nextReadyTask,
  type TaskProgress,
} from '@/lib/scheduler/ordering';
import type { Project, Task } from '@/lib/scheduler/types';

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

function project(
  id: string,
  deadline: string | null,
  priority: Project['priority'],
  tasks: Task[],
  createdAt = '2026-01-01',
): Project {
  return { id, deadline, priority, createdAt, tasks };
}

const noProgress: TaskProgress = new Map();

describe('remainingMinutes', () => {
  it('desconta actualMinutes', () => {
    expect(remainingMinutes(task('T', 'P', 0, 100, { actualMinutes: 30 }), noProgress)).toBe(70);
  });

  it('desconta também o que já foi alocado nesta rodada', () => {
    const progress: TaskProgress = new Map([['T', 40]]);
    expect(remainingMinutes(task('T', 'P', 0, 100), progress)).toBe(60);
  });

  it('nunca é negativo', () => {
    expect(remainingMinutes(task('T', 'P', 0, 100, { actualMinutes: 150 }), noProgress)).toBe(0);
  });
});

describe('isEligible', () => {
  it('tarefa concluída não é elegível', () => {
    expect(isEligible(task('T', 'P', 0, 100, { done: true }), noProgress)).toBe(false);
  });

  it('tarefa sem restante não é elegível', () => {
    expect(isEligible(task('T', 'P', 0, 100, { actualMinutes: 100 }), noProgress)).toBe(false);
  });

  it('tarefa sem estimativa da IA não é elegível', () => {
    expect(isEligible(task('T', 'P', 0, 100, { needsClarification: true }), noProgress)).toBe(false);
  });

  it('tarefa pendente com restante é elegível', () => {
    expect(isEligible(task('T', 'P', 0, 100), noProgress)).toBe(true);
  });
});

describe('rankProjects', () => {
  it('com prazo vem antes de sem prazo', () => {
    const ranked = rankProjects([
      project('SEM', null, 'alta', []),
      project('COM', '2026-09-30', 'baixa', []),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['COM', 'SEM']);
  });

  it('prazo mais próximo primeiro, mesmo com prioridade menor', () => {
    const ranked = rankProjects([
      project('LONGE', '2026-09-30', 'alta', []),
      project('PERTO', '2026-08-25', 'baixa', []),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['PERTO', 'LONGE']);
  });

  it('mesmo prazo: prioridade desempata (alta < media < baixa)', () => {
    const ranked = rankProjects([
      project('B', '2026-08-25', 'baixa', []),
      project('M', '2026-08-25', 'media', []),
      project('A', '2026-08-25', 'alta', []),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['A', 'M', 'B']);
  });

  it('mesmo prazo e prioridade: createdAt mais antigo desempata', () => {
    const ranked = rankProjects([
      project('NOVO', '2026-08-25', 'media', [], '2026-05-01'),
      project('VELHO', '2026-08-25', 'media', [], '2026-02-01'),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['VELHO', 'NOVO']);
  });

  it('empate final: id alfabético, para determinismo total', () => {
    const ranked = rankProjects([
      project('Z', '2026-08-25', 'media', [], '2026-02-01'),
      project('A', '2026-08-25', 'media', [], '2026-02-01'),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['A', 'Z']);
  });

  it('não muta o array recebido', () => {
    const input = [
      project('SEM', null, 'alta', []),
      project('COM', '2026-09-30', 'baixa', []),
    ];
    rankProjects(input);
    expect(input.map((p) => p.id)).toEqual(['SEM', 'COM']);
  });

  it('ordena os projetos sem prazo entre si por prioridade', () => {
    const ranked = rankProjects([
      project('B', null, 'baixa', []),
      project('A', null, 'alta', []),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['A', 'B']);
  });
});

describe('nextReadyTask', () => {
  it('devolve a tarefa de menor orderIndex ainda não concluída', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180),
        task('A2', 'P', 1, 120),
      ]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('A1');
  });

  it('não pula para A2 enquanto A1 não está 100% alocada', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180),
        task('A2', 'P', 1, 120),
      ]),
    ];
    const progress: TaskProgress = new Map([['A1', 179]]);
    expect(nextReadyTask(projects, progress)?.id).toBe('A1');
  });

  it('libera A2 quando A1 está totalmente alocada', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180),
        task('A2', 'P', 1, 120),
      ]),
    ];
    const progress: TaskProgress = new Map([['A1', 180]]);
    expect(nextReadyTask(projects, progress)?.id).toBe('A2');
  });

  it('pula tarefa concluída sem bloquear o projeto', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180, { actualMinutes: 180, done: true }),
        task('A2', 'P', 1, 120),
      ]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('A2');
  });

  it('pula tarefa sem estimativa sem bloquear o projeto', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180, { needsClarification: true }),
        task('A2', 'P', 1, 120),
      ]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('A2');
  });

  it('atravessa projetos na ordem de urgência', () => {
    const projects = [
      project('LONGE', '2026-09-30', 'alta', [task('L', 'LONGE', 0, 48)]),
      project('PERTO', '2026-08-25', 'baixa', [task('P', 'PERTO', 0, 48)]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('P');
  });

  it('cai para o próximo projeto quando o mais urgente acabou', () => {
    const projects = [
      project('LONGE', '2026-09-30', 'alta', [task('L', 'LONGE', 0, 48)]),
      project('PERTO', '2026-08-25', 'baixa', [task('P', 'PERTO', 0, 48)]),
    ];
    const progress: TaskProgress = new Map([['P', 48]]);
    expect(nextReadyTask(projects, progress)?.id).toBe('L');
  });

  it('devolve null quando não há nada pronto', () => {
    expect(nextReadyTask([], noProgress)).toBeNull();
  });

  it('respeita orderIndex mesmo se o array de tarefas vier fora de ordem', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A2', 'P', 1, 120),
        task('A1', 'P', 0, 180),
      ]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('A1');
  });
});

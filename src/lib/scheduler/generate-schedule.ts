// Motor de distribuição do Cadence — código puro e determinístico.
// Implementa exatamente scheduler-spec.md. Nunca usa IA; a IA só estima
// duração de tarefa (ver CLAUDE.md, seção 5 — regra de ouro).

import { addDays, daysBetween, isAfter, weekdayOf } from './date-utils';
import {
  PERIOD_ORDER,
  type AvailabilitySlot,
  type InfeasibleProject,
  type Period,
  type Priority,
  type Project,
  type ScheduleBlock,
  type SchedulerConfig,
  type SchedulerInput,
  type SchedulerResult,
  type Task,
} from './types';

// ---------------------------------------------------------------------------
// 4.1 Capacidade efetiva de um período num dia
// ---------------------------------------------------------------------------

function effectiveCapacity(
  date: string,
  period: Period,
  availability: AvailabilitySlot[],
  bufferPct: number,
): number {
  const weekday = weekdayOf(date);
  const slot = availability.find(
    (s) => s.weekday === weekday && s.period === period,
  );
  const hoursBrutas = slot?.hours ?? 0;
  return Math.floor(hoursBrutas * 60 * (1 - bufferPct));
}

// ---------------------------------------------------------------------------
// 4.2 Minutos restantes de uma tarefa
// ---------------------------------------------------------------------------

function remaining(task: Task): number {
  if (task.done) return 0;
  return Math.max(0, task.estimatedMinutes - task.actualMinutes);
}

// ---------------------------------------------------------------------------
// 4.4 Ranking de urgência do projeto (menor = mais urgente)
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };

function compareProjects(a: Project, b: Project): number {
  const aHasDeadline = a.deadline !== null;
  const bHasDeadline = b.deadline !== null;

  // 1. Com prazo antes de sem prazo.
  if (aHasDeadline !== bHasDeadline) return aHasDeadline ? -1 : 1;

  // 2. Entre os com prazo: prazo mais próximo primeiro.
  if (aHasDeadline && bHasDeadline && a.deadline !== b.deadline) {
    return a.deadline! < b.deadline! ? -1 : 1;
  }

  // 3. Empate: prioridade (alta < media < baixa).
  if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  }

  // 4. Empate: createdAt mais antigo primeiro.
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }

  // 5. Empate final: id (ordem alfabética) — determinismo total.
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// 4.3 Tarefa "pronta" de um projeto (dependência do passo a passo)
// ---------------------------------------------------------------------------

/** Clona projetos/tarefas para estado de trabalho local (função pura — não
 * muta o input). Tarefas ficam ordenadas por orderIndex pra achar a "pronta"
 * com uma simples varredura. */
function cloneWorkingProjects(projects: Project[]): Project[] {
  return projects.map((p) => ({
    ...p,
    tasks: [...p.tasks]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((t) => ({ ...t })),
  }));
}

function readyTaskOf(project: Project): Task | null {
  for (const task of project.tasks) {
    if (remaining(task) > 0) return task;
  }
  return null;
}

/** Próxima tarefa a alocar: primeira tarefa pronta, seguindo o ranking de
 * urgência dos projetos (4.4) e a ordem sequencial dentro do projeto (4.3). */
function nextReadyTask(projectsRanked: Project[]): Task | null {
  for (const project of projectsRanked) {
    const task = readyTaskOf(project);
    if (task) return task;
  }
  return null;
}

function hasAnyRemaining(projects: Project[]): boolean {
  return projects.some((p) => p.tasks.some((t) => remaining(t) > 0));
}

// ---------------------------------------------------------------------------
// 5. O algoritmo (núcleo)
// ---------------------------------------------------------------------------

function allocateBlocks(
  input: SchedulerInput,
  projectsRanked: Project[],
): ScheduleBlock[] {
  const { availability, config } = input;
  const blocks: ScheduleBlock[] = [];

  let date = input.today;
  const horizon = addDays(input.today, config.maxHorizonDays);

  while (hasAnyRemaining(projectsRanked) && !isAfter(date, horizon)) {
    for (const period of PERIOD_ORDER) {
      let cap = effectiveCapacity(date, period, availability, config.bufferPct);

      while (cap > 0) {
        const task = nextReadyTask(projectsRanked);
        if (!task) break;

        const rem = remaining(task);
        const chunk = Math.min(rem, cap);

        // Guarda anti-sliver: não cria pedaço menor que minBlock, a não ser
        // que esse pedaço conclua a tarefa.
        if (chunk < config.minBlockMinutes && chunk < rem) break;

        blocks.push({ taskId: task.id, date, period, minutes: chunk });
        task.actualMinutes += chunk;
        cap -= chunk;
      }
    }
    date = addDays(date, 1);
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// 6 e 7. Viabilidade, as 3 saídas e data de término prevista
// ---------------------------------------------------------------------------

function lastBlockDate(blocks: ScheduleBlock[], taskIds: Set<string>): string | null {
  let last: string | null = null;
  for (const b of blocks) {
    if (!taskIds.has(b.taskId)) continue;
    if (last === null || b.date > last) last = b.date;
  }
  return last;
}

function buildResult(
  blocks: ScheduleBlock[],
  input: SchedulerInput,
  projectsRanked: Project[],
): SchedulerResult {
  const infeasibleProjects: InfeasibleProject[] = [];
  const projectedCompletion: Record<string, string> = {};

  for (const project of projectsRanked) {
    const taskIds = new Set(project.tasks.map((t) => t.id));
    const lastDate = lastBlockDate(blocks, taskIds);
    if (lastDate !== null) {
      projectedCompletion[project.id] = lastDate;
    }

    if (project.deadline === null) continue;

    const deadline = project.deadline;
    const afterDeadlineMinutes = blocks
      .filter((b) => taskIds.has(b.taskId) && b.date > deadline)
      .reduce((sum, b) => sum + b.minutes, 0);
    const unallocatedMinutes = project.tasks.reduce(
      (sum, t) => sum + remaining(t),
      0,
    );
    const deficitMinutes = afterDeadlineMinutes + unallocatedMinutes;

    if (deficitMinutes > 0) {
      const diasDisponiveis = Math.max(1, daysBetween(input.today, deadline) + 1);
      infeasibleProjects.push({
        projectId: project.id,
        deficitMinutes,
        options: {
          esticarPrazoAte: lastDate ?? deadline,
          adicionarMinutosPorDia: Math.ceil(deficitMinutes / diasDisponiveis),
          cortarEscopoMinutos: deficitMinutes,
        },
      });
    }
  }

  return {
    feasible: infeasibleProjects.length === 0,
    blocks,
    infeasibleProjects,
    projectedCompletion,
  };
}

// ---------------------------------------------------------------------------
// Função pública
// ---------------------------------------------------------------------------

export function generateSchedule(input: SchedulerInput): SchedulerResult {
  const projectsRanked = cloneWorkingProjects(input.projects).sort(
    compareProjects,
  );
  const blocks = allocateBlocks(input, projectsRanked);
  return buildResult(blocks, input, projectsRanked);
}

export type { SchedulerConfig };

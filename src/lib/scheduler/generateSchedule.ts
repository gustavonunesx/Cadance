import { PERIODS, addDays, daysBetween, effectiveCapacity } from './capacity';
import {
  nextReadyTask,
  remainingMinutes,
  type TaskProgress,
} from './ordering';
import type {
  InfeasibleProject,
  ScheduleBlock,
  SchedulerInput,
  SchedulerResult,
} from './types';

/**
 * Distribui as tarefas dos projetos nos dias disponíveis.
 *
 * Função pura: não fala com banco nem com IA, e não muta a entrada — o
 * progresso da alocação vive num Map local (scheduler-spec §1 e §5).
 */
export function generateSchedule(input: SchedulerInput): SchedulerResult {
  const { today, projects, availability, config } = input;
  const blocks: ScheduleBlock[] = [];
  const progress: TaskProgress = new Map();

  const horizon = addDays(today, config.maxHorizonDays);
  let date = today;

  while (date <= horizon && nextReadyTask(projects, progress) !== null) {
    for (const period of PERIODS) {
      let cap = effectiveCapacity(date, period, availability, config.bufferPct);

      while (cap > 0) {
        const task = nextReadyTask(projects, progress);
        if (task === null) break;

        const remaining = remainingMinutes(task, progress);
        const chunk = Math.min(remaining, cap);

        // Guarda anti-sliver: nada menor que minBlock, a não ser que conclua
        // a tarefa. O resto do período vira folga extra.
        if (chunk < config.minBlockMinutes && chunk < remaining) break;

        blocks.push({ taskId: task.id, date, period, minutes: chunk });
        progress.set(task.id, (progress.get(task.id) ?? 0) + chunk);
        cap -= chunk;
      }
    }
    date = addDays(date, 1);
  }

  return buildResult(blocks, progress, input);
}

function buildResult(
  blocks: ScheduleBlock[],
  progress: TaskProgress,
  input: SchedulerInput,
): SchedulerResult {
  const { today, projects } = input;

  const unestimatedTasks = projects.flatMap((project) =>
    project.tasks
      .filter((task) => task.needsClarification && !task.done)
      .map((task) => task.id),
  );

  const projectedCompletion: Record<string, string> = {};
  const infeasibleProjects: InfeasibleProject[] = [];

  for (const project of projects) {
    const taskIds = new Set(project.tasks.map((task) => task.id));
    const projectBlocks = blocks.filter((block) => taskIds.has(block.taskId));

    const lastDate = lastBlockDate(projectBlocks);
    if (lastDate !== null) projectedCompletion[project.id] = lastDate;

    if (project.deadline === null) continue;

    const afterDeadline = projectBlocks
      .filter((block) => block.date > project.deadline!)
      .reduce((sum, block) => sum + block.minutes, 0);

    // O que nem chegou a ser alocado (horizonte estourado, sem disponibilidade)
    // também é deficit. Tarefas flagueadas são excluídas — sem estimativa, não
    // há número honesto para contar (pipeline-spec §4.4).
    const neverAllocated = project.tasks.reduce((sum, task) => {
      if (task.needsClarification) return sum;
      return sum + remainingMinutes(task, progress);
    }, 0);

    const deficitMinutes = afterDeadline + neverAllocated;
    if (deficitMinutes <= 0) continue;

    // Sem nenhum bloco não há "última data" real — o prazo original é o que
    // resta de informação honesta.
    const esticarPrazoAte = lastDate ?? project.deadline;
    const diasDisponiveis = Math.max(1, daysBetween(today, project.deadline) + 1);

    infeasibleProjects.push({
      projectId: project.id,
      deficitMinutes,
      options: {
        esticarPrazoAte,
        adicionarMinutosPorDia: Math.ceil(deficitMinutes / diasDisponiveis),
        cortarEscopoMinutos: deficitMinutes,
      },
    });
  }

  return {
    feasible: infeasibleProjects.length === 0,
    blocks,
    infeasibleProjects,
    projectedCompletion,
    unestimatedTasks,
  };
}

function lastBlockDate(blocks: ScheduleBlock[]): string | null {
  if (blocks.length === 0) return null;
  return blocks.reduce((latest, block) => (block.date > latest ? block.date : latest), blocks[0].date);
}

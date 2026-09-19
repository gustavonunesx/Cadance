import type { Priority, Project, Task } from './types';

/** taskId -> minutos alocados nesta rodada, além de actualMinutes. */
export type TaskProgress = Map<string, number>;

const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };

/** Quanto ainda falta da tarefa, contando o que já foi alocado neste plano. */
export function remainingMinutes(task: Task, progress: TaskProgress): number {
  const allocated = task.actualMinutes + (progress.get(task.id) ?? 0);
  return Math.max(0, task.estimatedMinutes - allocated);
}

/**
 * Tarefa pode gerar bloco? `done`, restante 0 e `needsClarification` são as
 * três portas de saída (scheduler-spec §4.2 + pipeline spec §4.3).
 */
export function isEligible(task: Task, progress: TaskProgress): boolean {
  if (task.done) return false;
  if (task.needsClarification) return false;
  return remainingMinutes(task, progress) > 0;
}

/** Projetos por urgência, menor = mais urgente (scheduler-spec §4.4). */
export function rankProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    // 1. Com prazo antes de sem prazo.
    if (a.deadline !== null && b.deadline === null) return -1;
    if (a.deadline === null && b.deadline !== null) return 1;
    // 2. Entre os com prazo: earliest-deadline-first.
    if (a.deadline !== null && b.deadline !== null && a.deadline !== b.deadline) {
      return a.deadline < b.deadline ? -1 : 1;
    }
    // 3. Prioridade.
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    // 4. createdAt mais antigo.
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    // 5. id, para determinismo total.
    return a.id.localeCompare(b.id);
  });
}

/**
 * A tarefa pronta do projeto mais urgente que tem alguma.
 *
 * Dentro do projeto as tarefas são estritamente sequenciais: a primeira
 * elegível por `orderIndex` bloqueia as seguintes até ser 100% alocada.
 * Tarefas inelegíveis (concluídas, exauridas, sem estimativa) são puladas —
 * elas não travam o projeto (scheduler-spec §4.3).
 */
export function nextReadyTask(projects: Project[], progress: TaskProgress): Task | null {
  for (const project of rankProjects(projects)) {
    const ordered = [...project.tasks].sort((a, b) => a.orderIndex - b.orderIndex);
    const ready = ordered.find((task) => isEligible(task, progress));
    if (ready) return ready;
  }
  return null;
}

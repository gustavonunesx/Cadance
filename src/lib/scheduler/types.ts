// Tipos do algoritmo de distribuição (ver scheduler-spec.md §2).
// Código puro: nada aqui depende de banco, IA ou ambiente.

export type Period = 'manha' | 'tarde' | 'noite';
export type Priority = 'alta' | 'media' | 'baixa';
export type Difficulty = 'leve' | 'media' | 'pesada';

export interface Task {
  id: string;
  projectId: string;
  /** Ordem dentro do projeto (passo a passo). */
  orderIndex: number;
  estimatedMinutes: number;
  /** Já executado (0 no primeiro plano). */
  actualMinutes: number;
  /** Usado só na v2 (peak matching). */
  difficulty: Difficulty;
  done: boolean;
}

export interface Project {
  id: string;
  /** 'YYYY-MM-DD' ou null. */
  deadline: string | null;
  priority: Priority;
  /** Desempate estável. */
  createdAt: string;
  tasks: Task[];
}

export interface AvailabilitySlot {
  /** 0=domingo ... 6=sábado. */
  weekday: number;
  period: Period;
  /** Horas livres brutas naquele período/dia. */
  hours: number;
  isPeak: boolean;
}

export interface SchedulerConfig {
  /** Folga de segurança (padrão 0.20). */
  bufferPct: number;
  /** Menor pedaço agendável (padrão 15). */
  minBlockMinutes: number;
  /** Teto p/ projetos sem prazo (padrão 365). */
  maxHorizonDays: number;
}

export interface ScheduleBlock {
  taskId: string;
  /** 'YYYY-MM-DD' */
  date: string;
  period: Period;
  minutes: number;
}

export interface InfeasibleProject {
  projectId: string;
  /** Quanto não coube antes do prazo. */
  deficitMinutes: number;
  options: {
    /** Nova data em que fecharia. */
    esticarPrazoAte: string;
    adicionarMinutosPorDia: number;
    /** = deficitMinutes */
    cortarEscopoMinutos: number;
  };
}

export interface SchedulerResult {
  feasible: boolean;
  /** Sempre preenchido (o melhor plano possível). */
  blocks: ScheduleBlock[];
  /** Vazio se feasible. */
  infeasibleProjects: InfeasibleProject[];
  /** projectId -> data de término prevista. */
  projectedCompletion: Record<string, string>;
}

export interface SchedulerInput {
  /** 'YYYY-MM-DD' */
  today: string;
  projects: Project[];
  availability: AvailabilitySlot[];
  config: SchedulerConfig;
}

/** Constantes padrão (scheduler-spec.md §3). */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  bufferPct: 0.2,
  minBlockMinutes: 15,
  maxHorizonDays: 365,
};

/** Ordem cronológica de preenchimento dos períodos — não pode ser trocada. */
export const PERIOD_ORDER: readonly Period[] = ['manha', 'tarde', 'noite'];

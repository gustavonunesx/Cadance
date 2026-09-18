export type Period = 'manha' | 'tarde' | 'noite';
export type Priority = 'alta' | 'media' | 'baixa';
export type Difficulty = 'leve' | 'media' | 'pesada';

export interface Task {
  id: string;
  projectId: string;
  /** Ordem dentro do projeto — as tarefas são estritamente sequenciais. */
  orderIndex: number;
  estimatedMinutes: number;
  /** Já executado; 0 no primeiro plano. */
  actualMinutes: number;
  /** Usado só na v2 (peak matching). */
  difficulty: Difficulty;
  /** = (status === 'concluida') no banco. */
  done: boolean;
  /** A IA não conseguiu estimar: não gera bloco (default false). */
  needsClarification?: boolean;
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
  /** Teto para projetos sem prazo (padrão 365). */
  maxHorizonDays: number;
}

export interface ScheduleBlock {
  taskId: string;
  /** 'YYYY-MM-DD'. */
  date: string;
  period: Period;
  minutes: number;
}

export interface InfeasibleProject {
  projectId: string;
  /** Quanto não coube antes do prazo. */
  deficitMinutes: number;
  options: {
    /** Nova data em que o projeto fecharia. */
    esticarPrazoAte: string;
    adicionarMinutosPorDia: number;
    /** = deficitMinutes. */
    cortarEscopoMinutos: number;
  };
}

export interface SchedulerResult {
  feasible: boolean;
  /** Sempre preenchido — o melhor plano possível, mesmo inviável. */
  blocks: ScheduleBlock[];
  /** Vazio quando feasible. */
  infeasibleProjects: InfeasibleProject[];
  /** projectId -> data do último bloco daquele projeto. */
  projectedCompletion: Record<string, string>;
  /** taskIds com needsClarification: ficaram fora do plano. */
  unestimatedTasks: string[];
}

export interface SchedulerInput {
  /** 'YYYY-MM-DD'. */
  today: string;
  projects: Project[];
  availability: AvailabilitySlot[];
  config: SchedulerConfig;
}

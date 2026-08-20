-- Cadence — schema inicial
-- Ver PRD_Cadence.md, seção "Modelo de dados (rascunho)".
--
-- Tabelas: availability, projects, tasks, schedule_blocks, focus_sessions.
-- user_id já vem em todas as tabelas de topo (availability, projects) pra
-- deixar o caminho pronto pra multiusuário no futuro (ver PRD, seção 5),
-- sem precisar refazer estrutura.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- availability — disponibilidade da rotina do usuário (por dia da semana e
-- período)
-- ---------------------------------------------------------------------------

create table availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  weekday int not null check (weekday between 0 and 6), -- 0=domingo
  period text not null check (period in ('manha','tarde','noite')),
  hours numeric not null default 0,     -- horas livres naquele período/dia
  is_peak boolean default false         -- bloco de pico (mais produtivo)
);

-- ---------------------------------------------------------------------------
-- projects — projetos do usuário
-- ---------------------------------------------------------------------------

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text not null,
  source_md text,                       -- o .md original importado
  deadline date,                        -- opcional
  priority text default 'media' check (priority in ('alta','media','baixa')),
  status text default 'ativo' check (status in ('ativo','concluido','pausado')),
  estimated_total_minutes int,          -- soma das estimativas das tarefas
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- tasks — tarefas extraídas do checklist do .md
-- ---------------------------------------------------------------------------

create table tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  order_index int not null,             -- ordem/dependência no passo a passo
  estimated_minutes int not null,       -- estimativa da IA (editável)
  actual_minutes int default 0,         -- tempo real somado das sessões
  status text default 'pendente' check (status in ('pendente','em_andamento','concluida')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- schedule_blocks — o cronograma em si (1 tarefa pode virar vários blocos)
-- ---------------------------------------------------------------------------

create table schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  date date not null,
  period text check (period in ('manha','tarde','noite')),
  planned_minutes int not null,
  status text default 'planejado' check (status in ('planejado','feito','pulado')),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- focus_sessions — log do cronômetro (modo foco)
-- ---------------------------------------------------------------------------

create table focus_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int
);

-- ---------------------------------------------------------------------------
-- Índices de apoio às consultas mais comuns (tela "Hoje", visão de semana,
-- ordem do passo a passo dentro de um projeto).
-- ---------------------------------------------------------------------------

create index idx_availability_user on availability(user_id);
create index idx_projects_user on projects(user_id);
create index idx_tasks_project on tasks(project_id, order_index);
create index idx_schedule_blocks_task on schedule_blocks(task_id);
create index idx_schedule_blocks_date on schedule_blocks(date);
create index idx_focus_sessions_task on focus_sessions(task_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — cada usuário só acessa os próprios dados. Mesmo em v1
-- mono-usuário, isso deixa o Supabase Auth já correto quando o app virar
-- multiusuário (PRD, seção 5).
-- ---------------------------------------------------------------------------

alter table availability enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table schedule_blocks enable row level security;
alter table focus_sessions enable row level security;

create policy "Usuário gerencia sua própria disponibilidade"
  on availability for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Usuário gerencia seus próprios projetos"
  on projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Usuário gerencia tarefas dos seus projetos"
  on tasks for all
  using (
    exists (
      select 1 from projects
      where projects.id = tasks.project_id
        and projects.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects
      where projects.id = tasks.project_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Usuário gerencia blocos das suas tarefas"
  on schedule_blocks for all
  using (
    exists (
      select 1 from tasks
      join projects on projects.id = tasks.project_id
      where tasks.id = schedule_blocks.task_id
        and projects.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from tasks
      join projects on projects.id = tasks.project_id
      where tasks.id = schedule_blocks.task_id
        and projects.user_id = auth.uid()
    )
  );

create policy "Usuário gerencia sessões de foco das suas tarefas"
  on focus_sessions for all
  using (
    exists (
      select 1 from tasks
      join projects on projects.id = tasks.project_id
      where tasks.id = focus_sessions.task_id
        and projects.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from tasks
      join projects on projects.id = tasks.project_id
      where tasks.id = focus_sessions.task_id
        and projects.user_id = auth.uid()
    )
  );

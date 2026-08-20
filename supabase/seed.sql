-- Cadence — seed de demonstração
-- Ver PRD_Cadence.md, seção 9, "Mock data".
--
-- 1 perfil de rotina (1h manhã, 2h tarde, 3h noite, noite = pico)
-- 2 projetos com prazos e prioridades diferentes:
--   - "Site institucional da Titan Labs" (prazo em 6 dias, alta) -> cabe
--   - "App mobile MVP" (prazo hoje, média)                       -> não cabe
-- 1 cronograma de vários dias com os blocos já distribuídos, incluindo a
-- folga de segurança (nenhum período preenchido a 100%).
--
-- Os blocos abaixo NÃO foram calculados à mão — foram gerados rodando o
-- próprio `generateSchedule` (src/lib/scheduler) com estes projetos e esta
-- disponibilidade, ancorado em "hoje" e depois deslocado com `current_date +
-- N`. Isso respeita a regra de ouro do projeto: quem soma/distribui horas é
-- sempre o algoritmo, nunca um valor digitado à mão (ver CLAUDE.md, seção 5).

-- ---------------------------------------------------------------------------
-- Usuário de demonstração
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'gustavo.demo@cadence.local',
  crypt('cadence-demo-password', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(), now(),
  '', '', '', ''
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- availability — 1h manhã / 2h tarde / 3h noite todos os dias, noite = pico
-- ---------------------------------------------------------------------------

insert into availability (user_id, weekday, period, hours, is_peak)
select
  '10000000-0000-4000-8000-000000000001',
  weekday,
  period,
  hours,
  is_peak
from (values
  (0, 'manha', 1, false), (0, 'tarde', 2, false), (0, 'noite', 3, true),
  (1, 'manha', 1, false), (1, 'tarde', 2, false), (1, 'noite', 3, true),
  (2, 'manha', 1, false), (2, 'tarde', 2, false), (2, 'noite', 3, true),
  (3, 'manha', 1, false), (3, 'tarde', 2, false), (3, 'noite', 3, true),
  (4, 'manha', 1, false), (4, 'tarde', 2, false), (4, 'noite', 3, true),
  (5, 'manha', 1, false), (5, 'tarde', 2, false), (5, 'noite', 3, true),
  (6, 'manha', 1, false), (6, 'tarde', 2, false), (6, 'noite', 3, true)
) as v(weekday, period, hours, is_peak);

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------

insert into projects (id, user_id, name, source_md, deadline, priority, status, estimated_total_minutes, created_at)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '10000000-0000-4000-8000-000000000001',
    'Site institucional da Titan Labs',
    '# Site institucional' || chr(10) ||
    chr(10) ||
    '## Passo a passo' || chr(10) ||
    '- [ ] Estruturar wireframes' || chr(10) ||
    '- [ ] Implementar landing page' || chr(10) ||
    '- [ ] Revisar e publicar',
    current_date + 6,
    'alta',
    'ativo',
    510,
    now() - interval '30 days'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '10000000-0000-4000-8000-000000000001',
    'App mobile MVP',
    '# App mobile MVP' || chr(10) ||
    chr(10) ||
    '## Passo a passo' || chr(10) ||
    '- [ ] Prototipar telas principais',
    current_date,
    'media',
    'ativo',
    400,
    now() - interval '16 days'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

insert into tasks (id, project_id, title, order_index, estimated_minutes, actual_minutes, status)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Estruturar wireframes',       0, 180, 0, 'pendente'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'Implementar landing page',    1, 240, 0, 'pendente'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000101', 'Revisar e publicar',          2,  90, 0, 'pendente'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000102', 'Prototipar telas principais', 0, 400, 0, 'pendente')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- schedule_blocks — saída literal de generateSchedule() para os dados acima,
-- com "hoje" ancorado em current_date (D1..D4). Note a folga de segurança:
-- nenhum bloco chega ao limite bruto do período (ex.: noite bruta = 180 min,
-- capacidade efetiva com buffer 20% = 144 min — é isso que cada bloco de
-- "noite" respeita).
-- ---------------------------------------------------------------------------

insert into schedule_blocks (task_id, date, period, planned_minutes, status)
values
  -- D1 (hoje) — App mobile MVP consome o dia inteiro (é o mais urgente: prazo hoje)
  ('00000000-0000-4000-8000-000000000204', current_date,     'manha', 48,  'planejado'),
  ('00000000-0000-4000-8000-000000000204', current_date,     'tarde', 96,  'planejado'),
  ('00000000-0000-4000-8000-000000000204', current_date,     'noite', 144, 'planejado'),

  -- D2 — App mobile MVP termina (estourando o prazo); Site institucional começa
  ('00000000-0000-4000-8000-000000000204', current_date + 1, 'manha', 48,  'planejado'),
  ('00000000-0000-4000-8000-000000000204', current_date + 1, 'tarde', 64,  'planejado'),
  ('00000000-0000-4000-8000-000000000201', current_date + 1, 'tarde', 32,  'planejado'),
  ('00000000-0000-4000-8000-000000000201', current_date + 1, 'noite', 144, 'planejado'),

  -- D3 — wireframes terminam; landing page é feita quase por inteiro; revisão começa
  ('00000000-0000-4000-8000-000000000201', current_date + 2, 'manha', 4,   'planejado'),
  ('00000000-0000-4000-8000-000000000202', current_date + 2, 'manha', 44,  'planejado'),
  ('00000000-0000-4000-8000-000000000202', current_date + 2, 'tarde', 96,  'planejado'),
  ('00000000-0000-4000-8000-000000000202', current_date + 2, 'noite', 100, 'planejado'),
  ('00000000-0000-4000-8000-000000000203', current_date + 2, 'noite', 44,  'planejado'),

  -- D4 — revisão e publicação terminam; Site institucional concluído (bem antes do prazo em D+6)
  ('00000000-0000-4000-8000-000000000203', current_date + 3, 'manha', 46,  'planejado');

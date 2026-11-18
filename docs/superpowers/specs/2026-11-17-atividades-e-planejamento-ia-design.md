# Atividades e planejamento com IA — design

> Depende do spec de [Perfil de rotina](2026-11-05-perfil-de-rotina-design.md)
> (disponibilidade semanal) — ainda não implementado, mas já aprovado na
> maquete. Esta spec **substitui** a parte de entrada de tarefas do
> [pipeline de extração e reconciliação](2026-09-16-cadence-pipeline-ia-design.md)
> (seção 3 daquele doc) e os itens de `.md`/IA do `PRD_Cadence.md` §4 e §8 —
> o cadastro manual de atividades toma o lugar do parser de `.md`, que não
> será construído. O `scheduler-spec.md` e o código de `src/lib/scheduler/`
> **não são alterados** por esta spec (ver §11 sobre o único ponto de atenção
> para o próximo spec).
>
> Status: **rascunho para revisão do dono**, 2026-11-17. Nenhum código foi
> escrito.

## 1. Resumo em linguagem simples

- Você cadastra suas atividades e metas na mão (substitui o import de `.md`).
- Para cada atividade, a IA propõe como dividir em etapas (quando for uma
  meta aberta, como "aprender arquitetura de software") e estima duração,
  dificuldade e confiança, explicando o porquê. Nada entra no cronograma sem
  você aprovar, editar ou rejeitar essa proposta primeiro.
- O motor que distribui horas nos dias (`src/lib/scheduler/`) não muda uma
  linha — só passa a receber etapas aprovadas em vez de tarefas extraídas de
  checklist.
- A tela Hoje mostra, nesta etapa, só as atividades internas, em ordem
  cronológica. O formato já reserva lugar para os eventos do Google Calendar
  entrarem na mesma lista depois, sem reescrever a tela.
- Executar uma etapa permite marcar concluída ou parcial; ao sair do
  planejado, você toca um motivo rápido (e pode complementar com uma nota
  livre).
- O replanejamento roda sozinho (mesmo `generateSchedule`, a partir de hoje)
  toda vez que algo muda — mas só altera prioridade, prazo, escopo, etapas ou
  a estrutura de uma estimativa depois da sua aprovação explícita.
- Fora deste spec: Google Calendar (próximo spec, depende deste), IA lendo
  padrões no seu histórico (Etapa 5), linguagem natural livre, multiusuário.

## 2. Objetivo e critério de sucesso

Trocar a origem das tarefas do scheduler — de `.md` para atividades
cadastradas e aprovadas — e fechar o ciclo cadastro → proposta da IA →
aprovação → cronograma → execução → replanejamento, mono-usuário, sem
Google Calendar. Pronto quando:

1. Cadastrar uma atividade gera uma proposta da IA (etapas quando aplicável
   + estimativa + confiança + justificativa), revisável antes de aprovar.
2. Nenhuma etapa entra em `generateSchedule` sem `approved_at` preenchido, e
   nenhuma etapa é aprovável sem uma estimativa válida.
3. Atividades `pausadas` ou `concluídas` nunca entram na fila do scheduler,
   mesmo com etapas aprovadas pendentes.
4. `src/lib/scheduler/` não tem nenhuma linha alterada — os 84 testes
   continuam passando exatamente como estão.
5. A tela Hoje mostra o cronograma do dia com as atividades internas em
   ordem cronológica; alertas de inviabilidade e de divergência grande
   aparecem sempre, nunca escondidos.
6. Marcar uma etapa concluída/parcial grava o registro de execução (motivo +
   nota opcional), soma corretamente ao tempo já executado (sem duplicar) e
   dispara o replanejamento automático do restante.
7. Mudar prioridade, prazo ou escopo, excluir uma etapa, pausar uma
   atividade, ou propor uma reestimativa estrutural sempre passa por uma
   tela de aprovação explícita — nunca é silencioso.
8. `npm run test`, `npm run lint` e `npm run typecheck` verdes.

## 3. Decisões (fechadas nesta conversa)

| Tema | Decisão | Por quê |
| --- | --- | --- |
| Entrada de tarefas | Cadastro manual substitui `.md` | O roadmap original dependia de um parser que não chegou a existir; a visão do dono não cita `.md` |
| Decomposição de metas abertas | IA propõe (etapas + estimativa + justificativa) para **toda** atividade; dono aprova | Uniforme é mais simples que diferenciar por categoria; nada vira tarefa sem aprovação |
| Cadência do ciclo IA → aprovação | Só na criação e quando o monitoramento detectar necessidade real (atraso, prazo em risco, divergência grande) | Revisão semanal obrigatória é a cobrança que a própria visão do dono (§8) diz para não criar |
| Monitoramento | Sob demanda — recalcula tudo quando o app abre; sem job em segundo plano nem notificação externa no MVP | Evita infraestrutura nova (cron, fila, canal de notificação) antes de validar o produto |
| Registro de execução | Motivo rápido (chip) + nota livre opcional; sem IA interpretando texto livre neste MVP | Dados organizados o suficiente para alimentar o aprendizado depois, sem o custo de NLP agora |
| Aprendizado adaptativo | Captura desde já; IA lê padrões nos registros é Etapa 5; linguagem natural livre e replanejamento conversacional vêm depois disso | Evolução em 3 passos, cada um só depois do anterior estar validado |
| Automático × aprovação no replanejamento | Redistribuir horário de etapas já aprovadas é automático; mudar prioridade/prazo/escopo/etapas/pausa/estrutura da estimativa sempre pede aprovação | Reduz carga mental sem permitir mudança silenciosa em algo que importa |
| Privacidade da IA | A IA nunca recebe dado de calendário nem números de disponibilidade — só texto da atividade e um resumo do histórico de execução | Minimização de dados enviados a provedor externo (`.claude/rules/06-security.md`) |
| `user_id` / RLS | Segue o padrão do spec de Perfil de rotina — **a confirmar quando aquele código existir**, já que hoje é só spec, não implementação | Não antecipar SaaS/billing/multiusuário agora |
| Sessão interrompida sem `logExecution` | Aceito no MVP: se o app fechar/cair ou o dono navegar para outra tela antes de confirmar conclusão/parcial, o tempo da sessão não é registrado em lugar nenhum (`actual_minutes` não muda); sem autosave, heartbeat ou "continuar sessão?" neste spec | YAGNI/MVP-first: o pior caso é reestimar a etapa na mão na próxima revisão — mesmo fluxo que `checkForRisks` já cobre para qualquer outra divergência grande; construir recuperação antes de validar o uso real seria especular |

## 4. Fora do escopo

Parser de `.md`; Google Calendar (próximo spec — esta spec deixa pronto o
ponto de extensão na tela Hoje para ele, e identifica em §11 o ajuste que
ainda falta decidir no scheduler); job em segundo plano ou notificação fora
do app; IA interpretando linguagem natural livre em tempo real; recalibração
automática de estimativa por padrão de uso (Etapa 5); multiusuário, planos ou
billing; peak matching (`preferPeakForHeavy` — v2 do próprio scheduler,
decidido antes desta conversa, confirmado inalterado no código); desenho
visual detalhado do cronômetro do Modo Foco (fica para um ajuste de tela
depois — aqui só a ação iniciar/pausar/concluir e o gatilho do registro de
execução); telas Cronograma/Projetos.

## 5. Estrutura de arquivos

| Caminho | Responsabilidade |
| --- | --- |
| `supabase/migrations/<timestamp>_activities.sql` | Tabelas `activities`, `activity_steps`, `execution_logs` (§6). |
| `src/lib/activities/` (`schema.ts`, `mapping.ts`, `queries.ts`, `index.ts`) | Puro e testável: validação Zod, conversão linhas ↔ domínio, leitura/gravação recebendo o client por parâmetro — mesmo padrão de `src/lib/availability/`. |
| `src/lib/ai/` (`proposeActivityPlan.ts`, `schema.ts`, `client.ts`, `index.ts`) | Chamada à Claude API para propor etapas + estimativa; validação Zod da resposta; nunca recebe calendário ou disponibilidade. |
| `src/lib/execution/` (`schema.ts`, `queries.ts`, `index.ts`) | Registro de execução (motivo, nota, planejado × real). |
| `src/lib/planning/` (`buildSchedulerInput.ts`, `checkForRisks.ts`, `index.ts`) | Orquestração: monta o `SchedulerInput` a partir de atividades aprovadas + disponibilidade; roda `generateSchedule`; gera alertas determinísticos. Não persiste nada. |
| `src/lib/scheduler/` | **Sem alteração.** |
| `src/app/atividades/` (`page.tsx`, `nova-atividade-form.tsx`, `revisao-proposta.tsx`, `actions.ts`) | Cadastro, revisão da proposta da IA, aprovação/edição. |
| `src/app/hoje/` (`page.tsx`, `bloco-dia.tsx`, `registro-execucao-form.tsx`, `actions.ts`) | Cronograma do dia, alertas, ações de execução. |
| Dependências novas | `@anthropic-ai/sdk`, `zod` (se ainda não vier do Perfil de rotina). |

## 6. Banco

```sql
create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text,
  category text not null check (category in ('estudo','academico','cliente','pessoal')),
  client_label text,                      -- texto livre; não é FK (YAGNI — só cria tabela própria se precisar)
  deadline date,
  priority text not null default 'media' check (priority in ('alta','media','baixa')),
  status text not null default 'ativo' check (status in ('ativo','pausado','concluido')),
  created_at timestamptz not null default now()
);

create table activity_steps (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  order_index int not null,
  title text not null,
  estimated_minutes int check (estimated_minutes > 0 and estimated_minutes <= 480),  -- nulo = sem estimativa válida ainda (needs_clarification)
  actual_minutes int not null default 0,
  difficulty text not null default 'media' check (difficulty in ('leve','media','pesada')),
  status text not null default 'pendente' check (status in ('pendente','em_andamento','concluida')),
  needs_clarification boolean not null default false,
  confidence text check (confidence in ('alta','media','baixa')),  -- nulo até a IA propor
  approved_at timestamptz,                -- nulo = não entra no scheduler ainda
  created_at timestamptz not null default now(),
  constraint etapa_aprovada_tem_estimativa
    check (approved_at is null or estimated_minutes is not null)
);

create table execution_logs (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references activity_steps(id) on delete cascade,
  reason text check (reason in ('faltou_tempo','mais_dificil_que_esperado','compromisso_inesperado','cansaco','mudanca_prioridade','outro')),
  note text,
  planned_minutes int not null,
  actual_minutes int not null,
  logged_at timestamptz not null default now()
);

alter table activities enable row level security;
alter table activity_steps enable row level security;
alter table execution_logs enable row level security;

create policy "Usuário gerencia suas próprias atividades"
  on activities for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- `activity_steps` não tem user_id próprio (YAGNI — evita coluna
-- redundante). Posse é indireta via `activities`; a checagem fica numa
-- função SECURITY DEFINER em vez de um EXISTS direto na policy: evita que
-- a policy de `execution_logs` (dois joins) reavalie a RLS de
-- `activity_steps`/`activities` por dentro da própria checagem, e escreve
-- a regra de posse uma única vez, reusada pelas duas tabelas.
create function public.owns_activity(p_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.activities
    where id = p_activity_id
      and user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_activity(uuid) from public;
grant execute on function public.owns_activity(uuid) to authenticated;

create policy "Usuário gerencia etapas de suas próprias atividades"
  on activity_steps for all
  using (public.owns_activity(activity_id))
  with check (public.owns_activity(activity_id));

-- execution_logs está um nível mais abaixo (step -> activity): mesma
-- lógica, reusando owns_activity em vez de repetir o join.
create function public.owns_step(p_step_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.activity_steps
    where id = p_step_id
      and public.owns_activity(activity_id)
  );
$$;

revoke all on function public.owns_step(uuid) from public;
grant execute on function public.owns_step(uuid) to authenticated;

-- Append-only por convenção da aplicação (§7): sem policy de update/delete,
-- o banco também impõe isso, não só o código.
create policy "Usuário lê logs de suas próprias etapas"
  on execution_logs for select
  using (public.owns_step(step_id));

create policy "Usuário grava logs de suas próprias etapas"
  on execution_logs for insert
  with check (public.owns_step(step_id));

-- FK não é indexada automaticamente pelo Postgres; sem isso, as policies
-- acima (e qualquer leitura normal, como "etapas desta atividade") viram
-- varredura completa.
create index if not exists activities_user_id_idx on activities (user_id);
create index if not exists activity_steps_activity_id_idx on activity_steps (activity_id);
create index if not exists execution_logs_step_id_idx on execution_logs (step_id);
```

Sem tabela para `schedule_blocks`: o cronograma é sempre recomputado na hora
pelo `generateSchedule` (puro, chamado a cada abertura do app — §3
"Monitoramento"), nunca persistido. A tela Hoje renderiza o `ScheduleBlock[]`
em memória; `execution_logs` referencia a etapa (`step_id`), não um bloco
específico, porque não existe linha de bloco para referenciar. Isso também
fecha a dívida aberta no pipeline design doc (§5 daquele doc) sobre o
`status` de `schedule_blocks` — a pergunta deixa de existir porque a tabela
deixa de existir.

## 7. Código

**Mapeamento para o scheduler** (só etapas com `approved_at` preenchido
entram; o scheduler em si não sabe que "atividade" existe):

| `activities` / `activity_steps` | `src/lib/scheduler` |
| --- | --- |
| `activities.id` | `Project.id` |
| `activities.deadline` | `Project.deadline` |
| `activities.priority` | `Project.priority` |
| `activities.created_at` | `Project.createdAt` |
| `activity_steps.id` | `Task.id` |
| `activity_steps.activity_id` | `Task.projectId` |
| `activity_steps.order_index` | `Task.orderIndex` |
| `activity_steps.estimated_minutes` | `Task.estimatedMinutes` |
| `activity_steps.actual_minutes` | `Task.actualMinutes` |
| `activity_steps.difficulty` | `Task.difficulty` |
| `status = 'concluida'` | `Task.done = true` |
| `status in ('pendente','em_andamento')` | `Task.done = false` |
| `needs_clarification` | `Task.needsClarification` |
| `category`, `client_label`, `description`, `status = 'pausado'`, `confidence`, `approved_at` | sem equivalente — ficam só no domínio de atividades |

- `proposeActivityPlan({ title, description?, category, deadline }, context)`
  (IA): `description` vem de `activities.description` (novo campo, opcional —
  contexto extra para a proposta, sem outro uso nesta spec). `context` é só
  um **resumo** do histórico de execução relevante
  (ex: "últimas 3 etapas desta categoria levaram em média 20% mais que o
  estimado") — nunca a lista bruta, nunca calendário, nunca números de
  disponibilidade. Devolve etapas propostas (`title`, `estimated_minutes`,
  `difficulty`, `confidence`) + justificativa em pt-BR. Nunca inventa nem
  decide data/hora.
  - Validação Zod na saída, mesmo padrão do pipeline design doc original:
    `estimated_minutes` fora de `1..480`, ausente ou com tipo errado →
    a etapa nasce com `estimated_minutes: null` e `needs_clarification: true`
    em vez do valor inválido; JSON malformado → 1 retry → se falhar de novo,
    todas as etapas nascem flagueadas (`estimated_minutes: null`) e o dono
    decompõe/estima na mão. O cadastro nunca falha por completo.
- `saveApprovedSteps(activityId, steps)`: grava `approved_at = now()` nas
  etapas que o dono aprovou (podem ter sido editadas antes). **Rejeita** (erro
  em pt-BR, nada é gravado) qualquer etapa sem `estimated_minutes` válido —
  mesma regra que o `constraint etapa_aprovada_tem_estimativa` do banco impõe
  como segunda barreira. Quando o dono fornece/edita um valor válido para uma
  etapa flagueada, `needs_clarification` volta a `false` junto com a
  aprovação. Etapas não aprovadas continuam visíveis para revisão, mas fora
  do scheduler.
- `buildSchedulerInput(userId, today)`: lê **só atividades com
  `status = 'ativo'`** (pausadas e concluídas ficam inteiramente fora da
  fila — suas etapas aprovadas não competem por horário enquanto isso não
  mudar) + etapas aprovadas dessas atividades, monta `Project[]`/`Task[]`
  pela tabela acima, lê a disponibilidade semanal de `src/lib/availability`
  (sem nenhuma exceção — Google Calendar é a próxima spec) e devolve o
  `SchedulerInput` com `DEFAULT_SCHEDULER_CONFIG`.
- `checkForRisks(schedulerResult, recentLogs)` (determinístico, sem IA):
  repassa `infeasibleProjects`/`unestimatedTasks` do próprio resultado do
  scheduler como alertas, e compara `planned_minutes`×`actual_minutes` dos
  `execution_logs` recentes — desvio grande (ex: acima de 50%) gera um
  alerta e, quando implica mudar escopo/prazo/estimativa de algo já
  aprovado, uma **sugestão** que entra no mesmo fluxo de proposta → aprovação
  do cadastro (não é um mecanismo novo).
- `logExecution(stepId, { reason, note?, sessionMinutes })`: grava uma linha
  em `execution_logs` (o incremento desta sessão, não o total) e, no mesmo
  passo, soma `sessionMinutes` ao `activity_steps.actual_minutes` da etapa —
  incremento atômico, nunca um recálculo somando logs retroativamente, para
  sessões parciais repetidas nunca se contarem duas vezes. `execution_logs`
  é só histórico de auditoria (append-only); `activity_steps.actual_minutes`
  é a única fonte de verdade que o scheduler usa.
  - **Execução parcial:** o `status` da etapa permanece/vira `'em_andamento'`
    — só vira `'concluida'` quando o dono confirma explicitamente (bateu o
    tempo e disse que terminou, ou marcou concluída antes do tempo). Não há
    campo de "tempo restante": é sempre `estimated_minutes - actual_minutes`,
    recalculado a cada chamada (igual ao `remainingMinutes` que o scheduler já
    faz). Se `actual_minutes` alcançar `estimated_minutes` sem a etapa estar
    `'concluida'`, isso é a mesma divergência grande que `checkForRisks` já
    cobre — gera alerta/sugestão de reestimativa pelo fluxo de aprovação, não
    um mecanismo novo.
  - Depois de gravar, chama `buildSchedulerInput` + `generateSchedule` de novo
    — redistribuição automática do que resta.

## 8. Fluxos, erros e segurança

- **Cadastro:** título + descrição opcional + categoria + prazo opcional →
  `proposeActivityPlan` → tela de revisão (etapas editáveis) →
  `saveApprovedSteps`.
- **Falha da IA:** mesmo padrão do pipeline design doc original — nunca
  bloqueia o cadastro; etapas flagueadas ficam para o dono decompor/estimar
  manualmente.
- **Tela Hoje:** lê `buildSchedulerInput` + `generateSchedule` + `checkForRisks`.
  Mostra blocos do dia (todos com uma marca de origem — hoje só existe
  `"interno"`; o Google Calendar some um dia adiciona `"externo"` à mesma
  lista, sem mudar o layout). Alertas sempre no topo, nunca escondidos.
- **Execução:** iniciar/pausar grava progresso; concluir ou marcar parcial
  aciona o formulário de motivo (chip + nota opcional) e chama `logExecution`
  (regras de incremento e status da etapa: §7). Guarda contra duplo toque no
  botão de concluir — `logExecution` não deve ser chamado duas vezes para a
  mesma sessão. Sessão interrompida sem confirmar: tempo não registrado —
  aceito no MVP, ver §3.
- **Replanejamento automático:** toda vez que o app abre ou um registro de
  execução é criado, `generateSchedule` roda de novo com os dados atuais.
  Isso nunca gera uma pergunta — só atualiza a tela.
- **Replanejamento com aprovação:** qualquer escrita em `activities`/
  `activity_steps` além de `actual_minutes`/`status` operacional — prioridade,
  prazo, escopo (adicionar/remover etapa), `status = 'pausado'`, ou uma
  proposta estrutural de reestimativa — sempre passa pela mesma tela de
  proposta → aprovação do cadastro, com a justificativa de quem/o que gerou
  a sugestão.
- **Segurança:** RLS por posse em todas as tabelas novas — `user_id` direto
  em `activities`, `owns_activity`/`owns_step` nas tabelas filhas (§6); a IA
  nunca recebe dado de calendário, disponibilidade numérica ou dado de
  outro usuário; `ANTHROPIC_API_KEY` só server-side, nunca exposta ao
  cliente; falta adicioná-la ao `.env.local` (ainda não existe no repo).

## 9. Testes e verificação

- `src/lib/activities/`: schema (válido/inválido, limites de `estimated_minutes`,
  `estimated_minutes` nulo aceito quando `approved_at` também é nulo),
  mapping (ida/volta com o scheduler, tabela do §7), queries com client
  falso — mesmo padrão de `src/lib/availability/`.
- `saveApprovedSteps`: rejeita aprovação com `estimated_minutes` nulo; aceita
  e limpa `needs_clarification` quando um valor válido é fornecido.
- `src/lib/ai/`: teste com resposta mockada (válida, fora de faixa,
  malformada + retry + falha) — mesmo padrão do pipeline design doc original.
- `src/lib/planning/buildSchedulerInput`: puro, TDD — confirma que só etapas
  com `approved_at` entram no `Project[]` montado, e que atividades
  `pausado`/`concluido` são excluídas mesmo tendo etapas aprovadas.
- `src/lib/planning/checkForRisks`: puro, TDD — casos de divergência grande/
  pequena, e que `infeasibleProjects`/`unestimatedTasks` repassam sem
  alteração.
- `src/lib/execution/` / `logExecution`: múltiplas sessões parciais da mesma
  etapa somam em `activity_steps.actual_minutes` sem duplicar; status vira
  `'concluida'` só com confirmação explícita, nunca automaticamente ao
  atingir `estimated_minutes`.
- `src/lib/scheduler/`: **nenhum teste novo nem alterado** — os 84 existentes
  continuam cobrindo o que já cobrem (confirmado nesta sessão, lendo o código
  real antes de escrever esta spec).
- Sem teste de aparência da tela Hoje ou do formulário (cola de framework);
  roteiro manual cobre isso.

## 10. Riscos

- **A regra de ouro ficou mais exigente.** A IA agora decompõe, não só
  estima. O prompt de `proposeActivityPlan` precisa deixar explícito que a
  saída é só proposta — nunca data, hora ou "cronograma" — do contrário o
  projeto reabre exatamente o erro que a regra sempre quis evitar.
- **RLS agora está escrita por extenso (§6)**, inclusive para as tabelas
  filhas sem `user_id` próprio (`owns_activity`/`owns_step`, revisadas por
  um subagente independente contra o padrão de `availability` do Perfil de
  rotina). **RLS habilitado não é o mesmo que isolamento comprovado** — só
  testar com dois usuários reais confirma; esse teste depende do Perfil de
  rotina (que define a autenticação) existir primeiro.
- **Confiança (`confidence`) é qualitativa, não estatística.** A IA propõe
  `'alta'/'media'/'baixa'` como leitura dela mesma sobre a própria proposta —
  nunca uma probabilidade calibrada. Na primeira interface pode aparecer
  discretamente na revisão da proposta, com uma frase explicando o porquê
  (ex: "confiança baixa — contexto curto"), nunca como percentual. O resto do
  tratamento na tela é detalhe de UI para a fase de telas, não decidido aqui.

## 11. Ponto de atenção para o próximo spec (Google Calendar)

Ao ler o código real do scheduler (não só os specs, por pedido do dono) para
escrever este documento, confirmei: `AvailabilitySlot` é indexado só por
`weekday` (0–6) — `effectiveCapacity` nunca olha a data, só o dia da semana
dela. Isso quer dizer que "descontar uma consulta de uma terça específica"
**não é um pass-through de zero toque** no scheduler, como uma leitura
rápida da conversa anterior poderia sugerir: reduzir o slot de terça afetaria
**toda** terça do horizonte (até 365 dias), não só aquela data.

A solução mais provável — estender `AvailabilitySlot` com um campo opcional
`date` que `effectiveCapacity` prioriza sobre o `weekday` recorrente quando
presente — é pequena, aditiva e não quebra nenhum dos 84 testes atuais (eles
nunca preenchem `date`, então continuam batendo na mesma lógica de hoje). Mas
é uma mudança real no código do scheduler, não "nenhuma linha", e por isso
fica para o spec de Google Calendar decidir e documentar — esta spec não a
antecipa nem a implementa.

## 12. Ordem sugerida para o plano

1. `src/lib/activities/` puro, com TDD (`schema`, `mapping`).
2. `src/lib/ai/` (proposta + Zod + teste com resposta mockada).
3. `src/lib/planning/` (`buildSchedulerInput`, `checkForRisks`), puro, TDD.
4. Migration e `queries.ts` de `src/lib/activities/` e `src/lib/execution/`
   (client falso).
5. Telas de cadastro + revisão/aprovação (`src/app/atividades/`).
6. Tela Hoje + alertas (`src/app/hoje/`).
7. `src/lib/execution/` + ação de concluir/parcial + motivo.
8. Fluxo de aprovação para mudanças de prioridade/prazo/escopo/pausa.

As tarefas 1–3 não compartilham arquivos entre si; 4 depende de 1; as
telas (5–8) dependem das anteriores.

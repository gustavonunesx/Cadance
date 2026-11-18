# Handoff — Cadence, 2026-11-17

> Escrito para retomar o trabalho em outra máquina, sem depender do
> histórico desta conversa. Leia este arquivo inteiro antes de agir.

## Estado atual

**Projeto:** Cadence — planejador pessoal que transforma projetos e
atividades num cronograma diário realista: a IA estima esforço, um
algoritmo determinístico distribui as horas nos dias respeitando
disponibilidade, prazo e prioridade, sempre com folga de segurança.
Primeira fase é uso pessoal (mono-usuário); a arquitetura não antecipa
SaaS, mas também não o impede.

**Branch:** `docs/spec-perfil-de-rotina`.
**Último commit antes deste handoff:** `59ded66` — "docs: spec de
Atividades e planejamento com IA (substitui pipeline de .md)". Este
handoff é commitado imediatamente depois; confira `git log --oneline -3`
para ver os dois lado a lado.

**Situação do repositório:** limpo. `59ded66` já está commitado E enviado
ao remoto (`origin/docs/spec-perfil-de-rotina` == local no momento em que
este handoff foi escrito). Nenhuma alteração pendente além deste próprio
handoff, que será commitado e enviado a seguir.

**Estado da especificação:** o spec em
`docs/superpowers/specs/2026-11-17-atividades-e-planejamento-ia-design.md`
está **revisado e aprovado pelo dono** — passou por uma revisão técnica
independente (subagente, foco em RLS/sessões interrompidas/replanejamento)
e por uma releitura final de consistência. **Ainda não existe plano de
implementação.** `superpowers:writing-plans` é o próximo passo autorizado,
mas não foi executado nesta sessão — ver "Pendências" abaixo.

## Documentos de referência

**Fonte principal das decisões atuais:**
[`docs/superpowers/specs/2026-11-17-atividades-e-planejamento-ia-design.md`](../specs/2026-11-17-atividades-e-planejamento-ia-design.md) —
leia este primeiro para qualquer decisão sobre cadastro de atividades,
proposta/estimativa da IA, aprovação, execução ou replanejamento.

**Ainda válidos e necessários:**
- [`docs/superpowers/specs/2026-11-05-perfil-de-rotina-design.md`](../specs/2026-11-05-perfil-de-rotina-design.md)
  — **pré-requisito**, não substituído. Define login por e-mail e a tela de
  disponibilidade semanal (Supabase). O spec de 2026-11-17 depende do
  `AvailabilitySlot` que este define. Também ainda não tem plano nem
  implementação — ninguém, até aqui, escreveu código de produto neste
  projeto.
- [`scheduler-spec.md`](../../../scheduler-spec.md) (raiz do repo) — inalterado,
  continua sendo a especificação exata de `src/lib/scheduler/`, já
  implementado e testado.
- [`.claude/rules/scheduler.md`](../../../.claude/rules/scheduler.md) — regra de
  ouro e invariantes do scheduler, inalterado.

**Superseded — não use para decisões atuais:**
- [`docs/superpowers/specs/2026-09-16-cadence-pipeline-ia-design.md`](../specs/2026-09-16-cadence-pipeline-ia-design.md)
  — sua **seção 3** (fronteira `.md` → IA, `src/lib/md/`) está substituída
  pelo spec de 2026-11-17: não haverá parser de `.md`. O resto do documento
  (histórico das contradições PRD×spec×testes, mapeamento banco↔scheduler)
  ainda é contexto histórico válido, mas não é o plano atual.
- `PRD_Cadence.md` — **parcialmente** desatualizado: §4 ("Importar projeto
  via `.md`") e §8 (prompt de extração por IA) não valem mais. O resto
  (problema, personas, paleta de cores, tipografia, regras de "nunca fazer",
  regras de negócio críticas 1-3 e 5) continua válido. Isto já estava
  sinalizado em `docs/STATUS.md` antes desta sessão; não foi corrigido
  ainda.
- `docs/harness/strategies.md` — já estava marcado como obsoleto em
  `docs/STATUS.md` (2026-11-05), antes desta sessão. Sem relação com o
  trabalho desta sessão.
- `docs/STATUS.md` (2026-11-05) — **atenção:** o próprio arquivo diz "leia
  isto primeiro numa sessão nova", mas seção "Onde estamos"/"Próximos
  passos" dele é de ANTES desta sessão e não menciona o spec de
  Atividades/IA. Não foi atualizado nesta sessão (não estava no escopo
  pedido). Para o estado atual, **este handoff tem prioridade** sobre
  `STATUS.md` até alguém atualizá-lo ou aposentá-lo.
- `docs/superpowers/plans/2026-09-18-cadence-scaffold-e-scheduler.md` e
  `docs/superpowers/plans/2026-11-05-scheduler-hardening.md` — planos já
  **executados** (o scaffold e o scheduler que existem hoje vieram daqui).
  Histórico, não ação pendente.

## Decisões importantes

**Arquitetura e dados**
- Cadastro manual de atividades **substitui** o import de `.md` — o parser
  nunca será construído.
- Para toda atividade, a IA propõe decomposição (quando aplicável) +
  estimativa + confiança (`'alta'/'media'/'baixa'`, **qualitativa, nunca
  probabilidade calibrada**) + justificativa. Nada entra no scheduler sem
  `approved_at` preenchido, e nenhuma etapa é aprovável sem
  `estimated_minutes` válido (constraint no banco + validação na aplicação,
  duas barreiras).
- **Não existe tabela `schedule_blocks`.** O cronograma é sempre
  recomputado na hora pelo `generateSchedule`, nunca persistido — decisão
  explícita do dono, que também fecha uma dívida aberta do pipeline design
  doc de 2026-09-16 (§5 daquele doc, sobre o `status` de blocos).
- Atividades `pausadas`/`concluídas` ficam inteiramente fora da fila do
  scheduler, mesmo com etapas aprovadas pendentes.

**IA, aprovação e execução**
- O ciclo IA-propõe → dono-aprova roda na criação da atividade e quando o
  monitoramento detectar necessidade real (atraso, prazo em risco,
  divergência grande) — **nunca** uma revisão semanal obrigatória.
- Monitoramento é **sob demanda**: recalcula tudo quando o app abre. Sem
  job em segundo plano, sem notificação fora do app, nesta etapa.
- Registro de execução: motivo rápido (6 chips, incluindo `outro`) + nota
  livre opcional. Sem IA interpretando texto livre ainda — evolução
  planejada em 3 passos: captura agora → IA lê padrões nos registros
  (Etapa 5, depois do MVP) → linguagem natural livre + replanejamento
  conversacional (depois disso).
- Sessão interrompida sem chamar a função de registro de execução (app
  fecha/cai, ou o dono navega pra outra tela antes de confirmar): **aceito
  no MVP**, o tempo não é registrado em lugar nenhum. Decisão explícita, não
  lacuna esquecida — ver §3 do spec de 2026-11-17.
- Automático × aprovação no replanejamento: redistribuir horário de etapas
  já aprovadas é automático e silencioso; mudar prioridade, prazo, escopo
  (adicionar/remover etapa), pausar uma atividade, ou propor uma
  reestimativa estrutural **sempre** passa por aprovação explícita — nunca
  silencioso.
- Privacidade: a IA nunca recebe dado de calendário, nunca recebe números
  de disponibilidade, nunca recebe dado de outro usuário — só texto da
  atividade e um resumo (não a lista bruta) do histórico de execução.

**Google Calendar**
- Será **somente leitura** — sem criar, editar ou excluir eventos externos,
  escopo OAuth mínimo.
- **Pertence a uma especificação futura, ainda não escrita.** O spec de
  2026-11-17 só deixa um ponto de extensão pronto na tela Hoje (blocos já
  carregam uma marca de origem, hoje só `"interno"`) e documenta (§11
  daquele spec) que `AvailabilitySlot` hoje só entende `weekday` recorrente,
  não data específica — "descontar uma terça que vem" vai precisar de um
  campo `date` opcional novo ali, aditivo, mas é mudança real no scheduler
  que a próxima spec decide, não esta.

**Scheduler**
- `src/lib/scheduler/` **não deve ser modificado sem necessidade real e
  aprovação explícita do dono.** É a peça de maior risco do projeto, já
  testada e fechada.
- **84 testes, 6 arquivos, verificados nesta sessão** (comando `npm run
  test`, no commit `59ded66`): todos verdes. `npm run lint` e `npm run
  typecheck` também limpos no mesmo commit. Qualquer sessão futura que
  altere algo sob `src/lib/scheduler/` deve continuar vendo os mesmos 84
  testes passarem, ou ter aprovação explícita para o contrário.
- **Confirmado nesta sessão contra o código real (não só a spec):** etapas
  `em_andamento` com `actual_minutes` parcial continuam elegíveis, bloqueiam
  etapas posteriores da mesma atividade por `order_index`, têm o restante
  recalculado (`estimated - actual`) a cada replanejamento, e o
  replanejamento nunca volta para o passado — sem lacuna encontrada (ver
  `tests/lib/scheduler/ordering.test.ts:146` e
  `tests/lib/scheduler/generateSchedule.test.ts:488`).

**RLS / segurança**
- `activities` tem `user_id` direto; policy `using/with check (auth.uid() =
  user_id)`, igual ao padrão já usado em `availability` (spec de Perfil de
  Rotina).
- `activity_steps` e `execution_logs` **não têm `user_id` próprio** — posse
  é indireta via `activities`. A policy usa duas funções `SECURITY DEFINER
  STABLE` (`owns_activity(activity_id)`, `owns_step(step_id)`) em vez de
  `EXISTS` aninhado direto na policy — evita que a policy de
  `execution_logs` (dois joins de distância) reavalie a RLS de
  `activity_steps`/`activities` por dentro da própria checagem.
- `execution_logs` tem **só** policies de `SELECT` e `INSERT` (sem
  `UPDATE`/`DELETE`) — o banco impõe o append-only que o código já
  declarava, decisão do dono além do que a revisão técnica sugeriu.
- Índices criados nas 3 colunas de FK (Postgres não indexa FK
  automaticamente).
- **Ressalva que continua aberta:** RLS habilitado não é o mesmo que
  isolamento comprovado — só testar com dois usuários reais confirma, e
  isso depende do Perfil de Rotina (que define a autenticação) estar
  implementado primeiro.

**Processo**
- Para este projeto, a orientação original do dono (brief estratégico que
  abriu esta sessão, §13 dele) é: despache subagentes só quando houver
  independência real, especialização técnica necessária, ou ganho real de
  confiabilidade por revisão independente — serial por padrão, nunca uma
  estrutura de agentes maior que o necessário. Isso **tem precedência**,
  neste projeto, sobre qualquer orientação genérica de "delegar tudo por
  padrão" que a sessão do Claude Code possa trazer.

## Pendências e próximo passo

**Próximo passo autorizado:** executar `superpowers:writing-plans` a partir
do spec aprovado (`docs/superpowers/specs/2026-11-17-atividades-e-planejamento-ia-design.md`),
cuja própria §12 já sugere a ordem das tarefas.

**Ainda não autorizado nesta sessão** — e continua não autorizado até o
dono dizer explicitamente que pode avançar:
- Executar `writing-plans` ou qualquer outro planejamento de implementação.
- Escrever código de produto.
- Criar migrations além das já descritas em texto no spec (nenhuma foi
  aplicada a um banco real — não existe `.env.local` neste repo).
- Instalar dependências (`@anthropic-ai/sdk`, `zod`, ou qualquer outra).
- Chamar subagentes para qualquer trabalho de implementação.

**Dúvidas/riscos para o planejamento considerar** (sem reabrir decisões já
aprovadas):
- Tratamento exato de `confidence` na interface (como e onde aparece) —
  deliberadamente deixado pra fase de telas, não decidido ainda.
- A especificação de Google Calendar não existe — quando for escrita,
  precisa decidir a extensão de `AvailabilitySlot.date` (§11 do spec de
  2026-11-17) e o desenho completo de sincronização/OAuth.
- Teste de isolamento real entre dois usuários (RLS) só é possível depois
  do Perfil de Rotina estar implementado — não bloqueia escrever o plano,
  mas é um passo de verificação pendente para quando isso existir.
- `npm ci` relatou 14 vulnerabilidades (3 críticas, 4 altas) antes desta
  sessão (`docs/STATUS.md`, 2026-11-05) — ainda não investigado se são de
  produção ou só de dev.
- `PRD_Cadence.md` §4/§8 e a §3 do pipeline design doc de 2026-09-16
  continuam com texto desatualizado — não bloqueia o plano, mas alguém
  pode querer uma sessão de limpeza de documentação depois.

## Instruções para a próxima máquina

**Clonar/atualizar e confirmar o estado:**
```bash
git clone https://github.com/gustavonunesx/Cadance.git
cd Cadance
git checkout docs/spec-perfil-de-rotina
git pull
git log --oneline -3
```

**Instalar e verificar** (comandos confirmados nesta sessão, nesta máquina,
NÃO confirmados ainda numa instalação nova/outra máquina — rode e confira
antes de confiar):
```bash
npm install
npm run test        # esperado: 84 testes, 6 arquivos, todos verdes
npm run lint         # esperado: sem saída
npm run typecheck    # esperado: sem saída
```

**Versões confirmadas nesta sessão** (via `package.json` e execução real):
Node `>=20.9.0` (engine), Next.js `15.5`, React `19.1`, Tailwind `4.1`,
TypeScript `5.8`, Vitest `3.2.7` em runtime, ESLint `9.30`. Nenhuma
dependência de Supabase, Anthropic ou Google está instalada ainda — todas
vêm no plano de implementação, não antes.

**Armadilhas do ambiente** (herdadas de sessões anteriores, reconfirmadas
nesta):
- Rode `npm` (test/lint/typecheck) pelo **PowerShell**, não pelo Bash: um
  hook (`rtk`) reescreve comandos do Bash e pode bloquear lint/typecheck,
  principalmente em subagentes.
- O `CLAUDE.md` cita os agentes `code-reviewer` e `frontend-developer`, mas
  o Agent tool desta sessão não os lista como tipos disponíveis — revisões
  rodam como `general-purpose`. Reconfirmado nesta sessão.
- `npm run dev` altera o `package-lock.json` (patch do SWC) — não commitar
  essa mudança por engano.
- A branch remota `scaffold/nextjs-supabase-scheduler` guarda um client
  Supabase e shadcn já configurados — reaproveitar por **cópia de
  arquivos**, nunca por merge.
- Não existe `.env.local` nem `.env.local.example` neste repo. Não presuma
  que Supabase, Anthropic ou qualquer serviço externo está configurado ou
  acessível na máquina onde você está — isso é preparação explícita do
  dono (ver seção 10 do spec de Perfil de Rotina para o que ele precisa
  fazer no Supabase antes de qualquer implementação).

**Segredos:** nenhum token, chave ou arquivo `.env` está neste handoff, nem
deveria estar em nenhum documento deste repositório.

**Prompt curto para iniciar a próxima sessão do Claude:**
```
Leia primeiro, nesta ordem: este handoff
(docs/superpowers/handoffs/2026-11-17-cadence-handoff.md), o spec aprovado
(docs/superpowers/specs/2026-11-17-atividades-e-planejamento-ia-design.md)
e o spec de Perfil de Rotina
(docs/superpowers/specs/2026-11-05-perfil-de-rotina-design.md). Não execute
nenhuma ação — não rode writing-plans, não escreva código, não instale
nada — até confirmar comigo que a autorização para planejar ou implementar
segue valendo.
```

# 📋 PRD — Cadence
### Planejador que transforma seus projetos num cronograma diário realista, com IA

> Documento gerado seguindo a lógica de preenchimento da Etapa 0 (briefing) +
> complemento obrigatório, já convertido em PRD completo pronto para ir para
> o Claude Code.
>
> *(Nome "Cadence" = a cadência/ritmo do trabalho. Pode renomear à vontade.)*

---

## 1. Nome do Projeto

**Cadence** — você joga o projeto (com passo a passo e checklist), diz seu
prazo e quantas horas tem por dia, e ele devolve uma rotina dia a dia:
o que fazer hoje, por quanto tempo, sem sobrecarregar a cabeça.

---

## 2. Problema Identificado

Quando se tem **vários projetos e tarefas ao mesmo tempo**, o problema não é
falta de vontade — é não saber *quanto* de cada coisa fazer *quando*. "Foco
20 min nessa hoje, 2h naquela..." — sem um plano, isso vira uma bola de neve:
tarefa acumula, prazo aperta, e a cabeça sobrecarrega tentando segurar tudo
de uma vez.

**Impacto medido/sentido:**
- **Paralisia por excesso:** com muita coisa aberta ao mesmo tempo, a pessoa
  não sabe por onde começar, e o custo mental de *decidir* já consome energia
  antes de qualquer tarefa começar.
- **Prazos estourados por má distribuição:** sem calcular quantas horas cada
  projeto exige e quantas horas a pessoa realmente tem por dia, os projetos
  competem pelo mesmo tempo e algum sempre atrasa.
- **Planejamento irrealista:** listas de tarefas comuns (to-do) mostram *o
  que* fazer, mas não *quando* nem *por quanto tempo* — então a pessoa
  "planeja" 12h de trabalho num dia de 4h disponíveis e se frustra todo dia.

---

## 3. Solução

Um software que recebe o `.md` de contexto de um projeto (passo a passo +
checklist), **analisa com IA** e cruza com dois dados do usuário: o **prazo
de entrega** e a **rotina disponível** (quantas horas livres de manhã, tarde
e noite). A partir disso, entrega um **cronograma dia a dia**, distribuindo as
horas necessárias de cada projeto de forma realista — nunca empacotando o dia
até o limite. Além do plano, o app tem **modo foco com cronômetro** para
executar cada tarefa pelo tempo planejado e marcar como concluída, e
**replaneja sozinho** quando o usuário atrasa ou adianta.

Isso resolve o problema porque:
1. **Tira a decisão da cabeça do usuário** — em vez de "por onde começo?", o
   app responde "hoje, faça X por 40min e Y por 1h30". Uma tela, uma resposta.
2. **Torna o plano realista** — ele parte das horas que o usuário *de fato*
   tem, não de um dia idealizado, e reserva folga para imprevistos.
3. **Sobrevive à vida real** — quando um dia sai do plano (atrasou, faltou
   tempo), o cronograma se reequilibra a partir de hoje em vez de quebrar,
   acabando com o efeito bola de neve.

---

## 4. Funcionalidades Principais

| Funcionalidade | Regra de negócio |
|---|---|
| Importar projeto via `.md` | Usuário sobe um `.md` com contexto + passo a passo + checklist. A IA quebra isso em tarefas individuais e estima a duração de cada uma (ver seção 8). |
| Perfil de rotina/disponibilidade | Usuário informa, por período (manhã/tarde/noite) e por dia da semana, quantas horas tem livres. É a base de tudo — o cronograma nunca aloca mais horas do que o usuário disse ter. |
| Prazo por projeto | Cada projeto pode ter uma data limite (opcional). Com prazo, o app espreme para caber; sem prazo, o app sugere uma data de conclusão realista com base na disponibilidade. |
| Prioridade por projeto | Usuário marca prioridade (alta/média/baixa). Quando dois projetos disputam o mesmo tempo, o de maior prioridade e/ou prazo mais próximo ganha o slot. |
| Geração do cronograma | O motor distribui as tarefas em blocos diários respeitando: disponibilidade, prazo, prioridade, folga de segurança e o bloco de pico do usuário (tarefa pesada no horário mais produtivo). |
| Alerta de inviabilidade | Se as horas necessárias não couberem até o prazo dentro da rotina informada, o app **avisa honestamente** ("nesse ritmo não fecha até dia X") e oferece saídas: esticar prazo, adicionar horas, ou cortar escopo. Nunca entrega um plano de fantasia. |
| Tela "Hoje" | Tela principal mostra **só o dia de hoje** — os blocos de tarefa com horário e duração. É o antídoto contra a sobrecarga: o usuário não vê a montanha inteira, só o próximo passo. |
| Modo foco (cronômetro) | Ao iniciar uma tarefa, abre um cronômetro com o tempo planejado. Ao bater o tempo, o app pergunta "concluído?" — usuário marca concluído ou estende. O tempo real é registrado. |
| Marcar concluído | Tarefa pode ser concluída manualmente a qualquer momento, ou ao bater o tempo planejado. Concluir dispara o replanejamento do restante. |
| Replanejamento adaptativo | Quando o dia foge do plano (tarefa não feita, tempo estourado, tarefa adiantada), o app reequilibra o que resta **de hoje pra frente** — sem reescrever o passado. |
| Visão de projetos + progresso | Lista de todos os projetos com % concluído, horas gastas x estimadas e prazo. |
| Aprendizado de estimativa | O app compara tempo planejado x tempo real ao longo do uso e ajusta as estimativas futuras (ex: "você costuma levar 30% a mais do que estima"). |

---

## 5. Persona e Tipos de Usuários

| Papel | Pode fazer | Não pode fazer |
|---|---|---|
| **Usuário único** (você, gerenciando seus próprios projetos) | Cadastrar rotina, importar projetos, gerar/ajustar cronograma, usar o modo foco, marcar concluído, ver progresso | (v1 mono-usuário) — sem equipe, sem atribuir tarefa a terceiros, sem visão de gestor |

> 📝 Nota: nasce mono-usuário (resolve o *seu* problema primeiro). Mas o modelo
> de dados já traz `user_id`, então virar multiusuário (ex: você distribuindo
> tarefas para a equipe da Titan Labs no futuro) é ligar o Supabase Auth e as
> políticas de acesso — sem refazer estrutura.

---

## 6. Stack Tecnológica

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React + TypeScript | Você já domina; e como você vai abrir isso no celular durante o dia, web responsivo/PWA é ideal |
| Estilo | Tailwind CSS + shadcn/ui | Consistência e velocidade |
| Banco de dados | Supabase (Postgres) | Guardar rotina, projetos, tarefas, cronograma e sessões de foco; já domina |
| IA — análise do `.md` e estimativa | Claude API — **Sonnet** | A parte de entender o projeto e estimar duração de tarefa exige raciocínio real, não só completar texto |
| Motor de distribuição | **Algoritmo determinístico** (código, não IA) | Ver regra de negócio nº 1 abaixo — a IA estima, mas quem *distribui as horas nos dias* é um algoritmo, para o cronograma bater certo na conta |
| Deploy | Vercel | Gratuito, nativo com Next.js, PWA fácil |

**Restrição importante:** o cronograma tem que **fechar na matemática** (horas
alocadas nunca podem passar das horas disponíveis). Por isso a arquitetura
híbrida: IA para julgamento, algoritmo para a conta.

---

## 7. Referências de Design

O sentimento central do app é **calma, não pressão**. A pessoa chega
sobrecarregada — a interface tem que reduzir o peso, não aumentar. Isso guia
tudo: a tela de abertura mostra só *hoje*, com bastante respiro; a "montanha"
de tarefas fica escondida até o usuário pedir para ver.

**Mapa de telas (distribuição da informação):**
1. **Hoje** (tela principal) — blocos de hoje, um embaixo do outro, com o
   botão "iniciar" bem grande. Nada mais compete por atenção.
2. **Cronograma** — visão de semana/calendário com a distribuição completa
   (é aqui que a "montanha" mora, só quando o usuário quer).
3. **Foco** — tela cheia com o cronômetro da tarefa ativa, minimalista, sem
   distração (só a tarefa, o tempo e "concluir"/"pausar").
4. **Projetos** — lista de projetos com progresso e prazo.
5. **Rotina** — configuração da disponibilidade (manhã/tarde/noite por dia).
6. **Importar** — subir o `.md`, definir prazo e prioridade.

---

## COMPLEMENTO OBRIGATÓRIO DA ETAPA 0

### Paleta de cores

| Nome | Hex | Onde usar |
|---|---|---|
| Primary | `#4F46E5` | Botão "iniciar tarefa", blocos ativos, ações principais |
| Background | `#0C0D12` | Fundo geral (escuro = menos cansaço visual em uso diário) |
| Card | `#15161D` | Blocos de tarefa, cards de projeto |
| Text | `#F5F5F5` (principal) / `#9CA3AF` (secundário) | Texto e metadados |
| Sucesso | `#22C55E` | Tarefa concluída, dia em dia com o plano |
| Atenção | `#F59E0B` | Perto de estourar tempo/prazo, folga acabando |
| Alerta | `#EF4444` | Prazo inviável, tarefa muito atrasada |

### Tipografia

- **Heading (H1/H2/H3):** Inter, bold
- **Body / Botões:** Inter, medium
- **Cronômetro e durações:** JetBrains Mono — o tempo (25:00, 1h30) precisa
  ser lido de relance, sem ambiguidade

### Regras de design — o que NUNCA fazer

- **Nunca mostrar a lista completa de tarefas na tela inicial.** A tela
  "Hoje" mostra só hoje. Ver tudo de uma vez é exatamente a sobrecarga que o
  app existe pra resolver.
- **Nunca empacotar o dia 100%.** O visual do dia sempre mostra a folga
  reservada — o usuário precisa *ver* que sobra respiro, senão o plano parece
  opressor mesmo estando correto.
- **Nunca esconder o alerta de inviabilidade.** Se o prazo não fecha, isso é
  a informação mais importante da tela — aparece em destaque, não num cantinho.
- **Animações:** máximo 300ms, suaves, sem bounce — o app é pra acalmar, a
  transição não pode ser agitada.

### Idioma do conteúdo final

Todo o conteúdo em **pt-BR** — interface, mensagens da IA e alertas. Durações
no formato brasileiro (ex: "1h30", "40 min").

### Responsividade

- **Mobile (prioritário):** é onde o usuário mais vai olhar "o que faço
  agora" e usar o cronômetro. Coluna única, tela "Hoje" e "Foco" pensadas
  primeiro pra celular, botão de ação fixo e grande.
- **Desktop:** aproveita a largura pra visão de cronograma/semana lado a lado
  com o dia atual — modo "planejamento", quando o usuário senta pra organizar.

### Modelo de dados (rascunho)

```sql
-- Disponibilidade da rotina do usuário (por dia da semana e período)
create table availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  weekday int not null check (weekday between 0 and 6), -- 0=domingo
  period text not null check (period in ('manha','tarde','noite')),
  hours numeric not null default 0,     -- horas livres naquele período/dia
  is_peak boolean default false         -- bloco de pico (mais produtivo)
);

-- Projetos
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

-- Tarefas (extraídas do checklist do .md)
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

-- Blocos agendados (o cronograma em si — 1 tarefa pode virar vários blocos)
create table schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  date date not null,
  period text check (period in ('manha','tarde','noite')),
  planned_minutes int not null,
  status text default 'planejado' check (status in ('planejado','feito','pulado')),
  created_at timestamptz default now()
);

-- Sessões de foco (log do cronômetro)
create table focus_sessions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int
);
```

### Regras de negócio críticas

**1. Arquitetura híbrida: a IA estima, o algoritmo distribui.** Este é o ponto
mais importante do projeto.
- A **IA** lê o `.md`, quebra em tarefas e estima a duração de cada uma
  (julgamento).
- Um **algoritmo determinístico** (código puro) pega essas durações e as
  distribui pelos dias, respeitando disponibilidade, prazo, prioridade e
  folga. **A IA nunca faz a conta de somar horas** — modelos de linguagem
  erram aritmética, e um cronograma que não fecha na conta destrói a
  confiança no app inteiro.

**2. Folga de segurança obrigatória.** O algoritmo nunca aloca 100% das horas
disponíveis — reserva uma margem (padrão 15–20%, configurável) para
imprevistos. Empacotar o dia até o limite é o motivo nº 1 de cronograma que
ninguém consegue seguir.

**3. Checagem de viabilidade antes de entregar o plano.** Antes de mostrar o
cronograma, o algoritmo compara `horas necessárias` x `horas disponíveis até
o prazo`. Se não couber, **não gera um plano irreal** — mostra o alerta de
inviabilidade com as 3 saídas (esticar prazo / adicionar horas / cortar
escopo).

**4. Tarefa pesada no bloco de pico.** Se o usuário marcou um período como
"pico" (mais produtivo), o algoritmo prioriza colocar as tarefas mais longas
ou mais difíceis ali.

**5. Replanejamento só olha pra frente.** Ao reequilibrar, o app redistribui o
que resta a partir de hoje. Nunca reescreve dias passados (histórico é dado
real, não é pra "consertar").

**6. Estimativa aprende com o real.** A cada tarefa concluída, o app guarda
`planejado x real`. Com o tempo, aplica um fator de correção pessoal (ex: se o
usuário sistematicamente estoura 30%, as próximas estimativas já vêm ajustadas).

---

## 8. Prompts de IA

**System prompt — extração e estimativa a partir do `.md`:**
```
Você recebe o .md de contexto de um projeto (com passo a passo e checklist).
Sua função é APENAS analisar e estruturar — você NÃO monta cronograma nem soma
horas (isso é feito por outro sistema). Responda em pt-BR.

Para o projeto abaixo, retorne um JSON com uma lista de tarefas. Para cada
tarefa:
- "title": nome curto e acionável da tarefa
- "order_index": ordem lógica (respeite dependências do passo a passo)
- "estimated_minutes": estimativa realista de duração em minutos
- "difficulty": "leve" | "media" | "pesada" (ajuda a alocar no bloco de pico)

Regras de estimativa:
- Seja realista, não otimista. É melhor superestimar um pouco.
- Quebre tarefas muito grandes (> 120 min) em subtarefas menores.
- Se o .md não der detalhe suficiente pra estimar, marque
  "needs_clarification": true naquela tarefa.

Projeto (.md):
{markdown_content}
```

> Observação: a saída acima vai para o **algoritmo de distribuição** (código),
> que cruza com a tabela `availability`, o `deadline` e a `priority` para gerar
> os `schedule_blocks`. A IA não vê a agenda — ela só entende o projeto.

---

## 9. Prioridade de Build (MVP)

1. **Perfil de rotina:** cadastro de disponibilidade (manhã/tarde/noite por
   dia). É a fundação — sem isso nada é realista.
2. **Importar `.md` + extração por IA:** subir projeto, IA quebra em tarefas
   com estimativa, usuário revisa/ajusta.
3. **Motor de distribuição (algoritmo) + checagem de viabilidade:** gerar o
   cronograma respeitando disponibilidade/prazo/prioridade/folga, com o
   alerta de inviabilidade.
4. **Tela "Hoje":** mostrar só o dia atual com os blocos.
5. **Modo foco (cronômetro) + marcar concluído.**
6. **Replanejamento adaptativo** quando o dia foge do plano.
7. **Visão de projetos + progresso.**
8. **Fase 2:** aprendizado de estimativa (planejado x real), notificações,
   PWA instalável.

> Ordem proposital: os passos 1 a 5 já entregam o núcleo — importa o projeto,
> recebe a rotina dia a dia, e executa com cronômetro. Replanejamento (6) é o
> que torna o app resistente à vida real, e o aprendizado (8) é o que o deixa
> cada vez mais preciso com o tempo.

### Mock data

- **1 perfil de rotina** de exemplo (ex: 1h de manhã, 2h à tarde, 3h à noite,
  com a noite marcada como pico).
- **2 projetos** de exemplo com prazos diferentes e prioridades diferentes —
  um que **cabe** no prazo e um que **não cabe**, para testar tanto o
  cronograma normal quanto o alerta de inviabilidade.
- **1 cronograma gerado** de 5 dias com blocos distribuídos, incluindo a folga
  de segurança visível, para testar a tela "Hoje" e a visão de semana.

---

## ✅ Checklist final antes de considerar o PRD pronto

- [x] Nome, problema, solução e funcionalidades detalhadas
- [x] Persona definida (mono-usuário, com estrutura pronta pra multiusuário)
- [x] Stack com justificativa (arquitetura híbrida IA + algoritmo)
- [x] Paleta de cores em HEX
- [x] Tipografia definida
- [x] Regras de "nunca fazer" no design (foco no anti-sobrecarga)
- [x] Idioma especificado (pt-BR)
- [x] Responsividade mobile (prioritária) e desktop descritas separadamente
- [x] Mapa de telas (distribuição da informação) definido
- [x] Modelo de dados em SQL
- [x] Regras de negócio críticas (IA estima / algoritmo distribui, folga,
      viabilidade, replanejamento, aprendizado)
- [x] Prompt de IA pronto (extração + estimativa, sem fazer a conta)
- [x] Prioridade de build (MVP) definida
- [x] Mock data sugerido

---

*PRD gerado em Agosto 2026 — Gustavo / projeto pessoal.*
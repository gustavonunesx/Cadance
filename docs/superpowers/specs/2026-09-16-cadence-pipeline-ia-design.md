# Cadence — Pipeline de extração e reconciliação PRD × spec × testes

> Design fechado em 2026-09-16. Complementa `PRD_Cadence.md` e
> `scheduler-spec.md` — não os substitui. Resolve as contradições entre os
> três documentos e especifica a metade de IA, que até aqui existia só como
> um prompt.

---

## 1. Problema

O projeto tinha duas metades com níveis de especificação muito diferentes:

- **Scheduler** — `scheduler-spec.md`: tipos, pseudocódigo, casos de borda
  numerados, dois exemplos com aritmética conferida, checklist de testes.
  Pronto para implementar.
- **Extração por IA** — um único prompt em `PRD_Cadence.md` §8. Sem schema
  validável, sem tratamento de falha, sem definição de como o `.md` vira
  tarefas.

Além do desequilíbrio, havia quatro contradições reais entre os documentos.

---

## 2. Contradições encontradas e como foram resolvidas

### 2.1 Exemplo A: prosa da spec × teste

`scheduler-spec.md` §11 descrevia o D2 assim: A2 recebe 12min na manhã e os
36min restantes do período viram "folga"; B1 entra inteira (90min) na tarde.

`generateSchedule.test.ts:338-346` espera outra coisa: A2 12min + **B1 36min**
na manhã, B1 54min na tarde.

O pseudocódigo do §5 dá razão ao teste. O laço `enquanto cap > 0` continua
puxando `proximaTarefaPronta()` no mesmo período; quando A2 conclui com 12min,
sobram 36 de capacidade, B1 está pronta, e 36 ≥ `minBlockMinutes` (15), então a
guarda anti-sliver não bloqueia. B1 entra ali.

**Decisão: corrigir a prosa do §11.** Os testes ficam intactos. Era o risco
mais alto do projeto: quem implementasse lendo o "exemplo resolvido" — que a
spec oferece exatamente para isso — escreveria um algoritmo que falha o teste.

### 2.2 Peak matching: MVP ou v2?

`PRD_Cadence.md` §4 e a regra crítica nº 4 prometem "tarefa pesada no bloco de
pico" no MVP. `scheduler-spec.md` §9 adia explicitamente para v2 e manda
ignorar `isPeak` e `difficulty`.

**Decisão: v2**, como a spec já dizia. A justificativa dela é boa — peak
matching compete com earliest-deadline-first e, mal feito, empurra tarefa
urgente para depois, furando prazo. O PRD é corrigido.

### 2.3 `Task.done: boolean` × `tasks.status` de 3 estados

O banco modela `pendente` / `em_andamento` / `concluida`; o scheduler recebe
`done: boolean`. Não havia mapeamento definido para `em_andamento`.

**Decisão:** `done = (status === 'concluida')`. `em_andamento` vira
`done: false`; o progresso já vive em `actualMinutes`, e o §4.2 o desconta
sozinho. O scheduler não precisa conhecer o estado intermediário — para ele só
existe "quanto falta". `em_andamento` continua servindo à UI (tela Hoje).

### 2.4 Campos que a IA emite e o banco não guarda

O prompt pede `difficulty` e `needs_clarification`; a tabela `tasks` não tem
coluna para nenhum dos dois. `difficulty` é obrigatório no tipo `Task` do
scheduler.

**Decisão:** adicionar as duas colunas (§4 abaixo).

---

## 3. A fronteira IA / código

O `.md` passa por três etapas. Só a do meio usa IA.

```
.md → [parse determinístico] → tarefas sem estimativa
                                      ↓
                              [IA: só estima]  ← julgamento
                                      ↓
                          tarefas estimadas → [scheduler] → cronograma
```

### 3.1 `src/lib/md/` — parse do markdown (novo)

Não previsto no PRD original. Puro, testável sem API.

- Cada `- [ ]` do checklist vira uma tarefa, 1:1.
- `order_index` pela posição no arquivo.
- Texto fora do checklist é **contexto**: vai junto no prompt para informar a
  estimativa, mas não vira tarefa.
- Um `.md` sem nenhum `- [ ]` não produz tarefas. Aceitável: o formato de
  entrada é do próprio usuário.

Isso tira da IA a decisão de "o que é uma tarefa" e deixa com ela apenas
"quanto tempo isso leva" — que é julgamento de verdade. Uma decisão a menos no
lado não determinístico, coerente com a regra de ouro do projeto.

### 3.2 `src/lib/ai/` — estimativa

Recebe a lista já estruturada + o contexto. Devolve, por tarefa:

```typescript
{ id: string; estimated_minutes: number; difficulty: Difficulty; needs_clarification: boolean }
```

Nunca inventa nem remove tarefa — o conjunto de `id`s da resposta tem que ser
igual ao da entrada.

**Validação (Zod) na saída:**

- `0 < estimated_minutes <= 480` (8h; acima disso a própria regra do prompt
  manda quebrar a tarefa).
- Fora da faixa, ausente, ou tipo errado → `needs_clarification: true` naquela
  tarefa, em vez de aceitar o valor.
- JSON totalmente malformado → 1 retry → se falhar de novo, todas as tarefas
  nascem flagueadas e o usuário estima na mão. **O import nunca falha por
  completo** — o parse do `.md` que já deu certo não é perdido.

### 3.3 `src/lib/scheduler/`

Inalterado em relação a `scheduler-spec.md`, exceto por ignorar tarefas
flagueadas (§4.3 abaixo).

---

## 4. Mudanças de tipo e schema

Todas aditivas. Nenhum teste existente quebra.

### 4.1 `Task` do scheduler

```typescript
interface Task {
  id: string;
  projectId: string;
  orderIndex: number;
  estimatedMinutes: number;
  actualMinutes: number;
  difficulty: Difficulty;
  done: boolean;
  needsClarification?: boolean;   // novo, default false
}
```

Opcional de propósito: o helper `task()` de `generateSchedule.test.ts:49-65`
não passa esse campo e continua compilando.

### 4.2 `SchedulerResult`

```typescript
interface SchedulerResult {
  feasible: boolean;
  blocks: ScheduleBlock[];
  infeasibleProjects: InfeasibleProject[];
  projectedCompletion: Record<string, string>;
  unestimatedTasks: string[];     // novo: taskIds fora do plano
}
```

Os testes acessam `SchedulerResult` estruturalmente e nunca importam o tipo,
então o campo novo não quebra nada.

### 4.3 Regra nova no §4.3 da spec

Tarefa com `needsClarification: true` **não é elegível** — mesma porta de saída
que `done`. Não gera bloco; entra em `unestimatedTasks`.

### 4.4 Viabilidade com tarefas não estimadas

`feasible` passa a significar **"o que foi planejado cabe"**.

Uma tarefa flagueada não entra no cálculo de deficit — sem estimativa não há
número para somar, e inventar um violaria a regra de ouro tão gravemente
quanto ignorá-la. Em vez disso, `unestimatedTasks` carrega os `id`s, e a UI
mostra um alerta separado: *"2 tarefas sem estimativa não entraram neste
plano."*

O cronograma é honesto sobre o que calculou e honesto sobre o que não
calculou. Nunca finge um número que não tem.

### 4.5 SQL `tasks`

```sql
difficulty text default 'media' check (difficulty in ('leve','media','pesada')),
needs_clarification boolean default false,
```

### 4.6 Mapeamento banco → scheduler

| Banco | Scheduler |
| --- | --- |
| `status = 'concluida'` | `done: true` |
| `status = 'em_andamento'` | `done: false` (progresso em `actualMinutes`) |
| `status = 'pendente'` | `done: false` |
| `needs_clarification` | `needsClarification` |

---

## 5. Questões deixadas em aberto (dívida registrada)

Não resolvidas agora porque não bloqueiam o MVP:

- **`ScheduleBlock.status`** — o SQL tem `planejado`/`feito`/`pulado`; o tipo
  do scheduler não tem campo equivalente. Só importa quando o replanejamento
  (passo 6 da ordem de build) for implementado. A decisão pendente: um bloco
  `pulado` devolve os minutos ao restante da tarefa, ou eles são perdidos?
- **`maxHorizonDays` estourado** — se uma tarefa não cabe em 365 dias, projeto
  *com* prazo é coberto pela matemática do deficit (§6 da spec); projeto *sem*
  prazo tem `projectedCompletion` indefinido. `Record<string, string>` não
  comporta um sentinela "nunca conclui".
- **Zero disponibilidade** faz o laço girar 365 dias sem alocar nada. Correto,
  mas o custo nunca foi discutido.
- **Sem validação de entrada** no scheduler — `orderIndex` duplicado, negativo
  ou com buracos; `estimatedMinutes <= 0`; `hours` negativo. A spec diz que a
  função confia na entrada, mas nunca o afirma explicitamente.

---

## 6. Lacunas de teste encontradas

A checklist §12 da spec afirma cobrir "todos os casos de borda da seção 10".
Não cobre:

- **§10.7** (prazo exatamente no limite, viável com 0 de folga além do buffer)
  — nenhum teste no arquivo.
- **`ceil()` em `adicionarMinutosPorDia`** — o único teste usa 112÷1, que não
  tem resto, então não distingue `ceil` de `floor` ou truncamento.
- **`maxHorizonDays`** — nunca exercitado por teste algum.
- **`preferPeakForHeavy`** — a spec §9 pede a assinatura pronta; nenhum teste
  verifica que ela existe.

Viram tarefas do plano de implementação (passo 2).

---

## 7. Correções a aplicar nos documentos

1. `scheduler-spec.md` §11, Exemplo A — reescrever a alocação do D2 para
   refletir o que o §5 produz, com nota explicando que o laço continua
   preenchendo o período após concluir uma tarefa.
2. `PRD_Cadence.md` §4 e regra crítica nº 4 — marcar peak matching como v2.
3. `PRD_Cadence.md` §8 — reescrever o prompt: recebe tarefas já extraídas,
   devolve só estimativas.

---

## 8. Ordem de build

Mantida do PRD §9, com um passo 0 e uma troca de ordem.

| # | O quê | Verificação |
| --- | --- | --- |
| 0 | Scaffold: Next.js 15, Tailwind/shadcn, Vitest, alias `@`, Supabase | `npm run test`, `lint`, `typecheck` verdes |
| 1 | **Scheduler guiado pelos testes** — mover `generateSchedule.test.ts` para `tests/lib/scheduler/` | suíte inteira verde |
| 2 | Testes das lacunas do §6 acima | verdes |
| 3 | Perfil de rotina (PRD 1) | disponibilidade grava e lê |
| 4 | `src/lib/md/` — parse do checklist | testes de parse |
| 5 | `src/lib/ai/` — estimativa + validação Zod | teste com resposta mockada |
| 6 | Importar `.md` (PRD 2) | fluxo ponta a ponta |
| 7+ | Hoje → Foco → Replanejamento → Projetos (PRD 4-7) | por tela |

**Troca em relação ao PRD:** o scheduler vem antes da extração por IA. O PRD
põe extração em 2º e motor em 3º, mas os testes do scheduler já existem e não
dependem de nada. É a peça de maior risco e a única verificável hoje — nada
mais pode ser testado de verdade antes dela.

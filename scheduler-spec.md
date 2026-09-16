# scheduler-spec.md — Algoritmo de distribuição do Cadence

> Especificação da lógica de `/src/lib/scheduler`. É a peça de maior risco do
> projeto e a que os testes cobrem primeiro. Este documento é preciso de
> propósito: o Claude Code deve implementar exatamente isto, e os testes
> (passo c) validam contra os exemplos da seção 11.
>
> Lembrete da regra de ouro (ver `CLAUDE.md`): a IA só estima duração de
> tarefa. **Toda a lógica deste arquivo é código puro, determinístico e
> testável. Nada aqui usa IA.**

---

## 1. O que a função faz

Uma função pura:

```
generateSchedule(input) -> resultado
```

Recebe os projetos (com tarefas estimadas), a disponibilidade do usuário, a
data de hoje e configurações. Devolve **ou** um cronograma (lista de blocos
por dia/período) **ou** um resultado de inviabilidade (quando não cabe no
prazo). Sem efeito colateral: não fala com banco nem com IA — só recebe dados
e retorna dados.

---

## 2. Tipos (entrada e saída)

```typescript
type Period = 'manha' | 'tarde' | 'noite';
type Priority = 'alta' | 'media' | 'baixa';
type Difficulty = 'leve' | 'media' | 'pesada';

interface Task {
  id: string;
  projectId: string;
  orderIndex: number;        // ordem dentro do projeto (passo a passo)
  estimatedMinutes: number;
  actualMinutes: number;     // já executado (0 no primeiro plano)
  difficulty: Difficulty;    // usado só na v2 (peak matching)
  done: boolean;             // = (status === 'concluida') no banco
  needsClarification?: boolean;  // IA não estimou; não gera bloco (default false)
}

interface Project {
  id: string;
  deadline: string | null;   // 'YYYY-MM-DD' ou null
  priority: Priority;
  createdAt: string;         // desempate estável
  tasks: Task[];
}

interface AvailabilitySlot {
  weekday: number;           // 0=domingo ... 6=sábado
  period: Period;
  hours: number;             // horas livres brutas naquele período/dia
  isPeak: boolean;
}

interface SchedulerConfig {
  bufferPct: number;         // folga de segurança (padrão 0.20)
  minBlockMinutes: number;   // menor pedaço agendável (padrão 15)
  maxHorizonDays: number;    // teto p/ projetos sem prazo (padrão 365)
}

interface ScheduleBlock {
  taskId: string;
  date: string;              // 'YYYY-MM-DD'
  period: Period;
  minutes: number;
}

interface InfeasibleProject {
  projectId: string;
  deficitMinutes: number;    // quanto não coube antes do prazo
  options: {
    esticarPrazoAte: string;     // nova data em que fecharia
    adicionarMinutosPorDia: number;
    cortarEscopoMinutos: number; // = deficitMinutes
  };
}

interface SchedulerResult {
  feasible: boolean;
  blocks: ScheduleBlock[];              // sempre preenchido (o melhor plano possível)
  infeasibleProjects: InfeasibleProject[]; // vazio se feasible
  projectedCompletion: Record<string, string>; // projectId -> data de término prevista
  unestimatedTasks: string[];           // taskIds com needsClarification: ficaram fora do plano
}

// A função recebe um único objeto de entrada:
interface SchedulerInput {
  today: string;                 // 'YYYY-MM-DD'
  projects: Project[];
  availability: AvailabilitySlot[];
  config: SchedulerConfig;
}

// generateSchedule(input: SchedulerInput): SchedulerResult
```

---

## 3. Constantes padrão

- `bufferPct = 0.20` (reserva 20% de folga)
- `minBlockMinutes = 15`
- `maxHorizonDays = 365`

---

## 4. Definições auxiliares (as "peças" do algoritmo)

**4.1 Capacidade efetiva de um período num dia**
```
capacidadeEfetiva(date, period) =
  floor( horasBrutas(weekdayDe(date), period) * 60 * (1 - bufferPct) )
```
> É aqui que a folga de segurança vive. Se você tem 2h à tarde e buffer 20%,
> a capacidade usável é 2*60*0.8 = 96 min. O resto do algoritmo só preenche
> capacidade — então nenhum período jamais passa de 100% nem fica sem folga.

**4.2 Minutos restantes de uma tarefa**
```
restante(task) = max(0, task.estimatedMinutes - task.actualMinutes)
```
Tarefas com `done = true`, `restante = 0` ou `needsClarification = true` são
ignoradas.

> `needsClarification` significa que a IA não conseguiu estimar a duração. Sem
> estimativa não há o que distribuir, então a tarefa não gera bloco e não entra
> no cálculo de deficit — inventar um número violaria a regra de ouro tanto
> quanto ignorá-la. Ela vai para `unestimatedTasks`, e a UI mostra um alerta
> próprio ("N tarefas sem estimativa não entraram neste plano").
>
> Consequência: **`feasible` significa "o que foi planejado cabe"**, não "o
> projeto inteiro cabe". O plano é honesto sobre o que calculou e sobre o que
> não calculou.

**4.3 Tarefa "pronta" (dependência do passo a passo)**
Dentro de um projeto as tarefas são **estritamente sequenciais** por
`orderIndex`. A tarefa pronta de um projeto é a de menor `orderIndex` ainda
não concluída. Uma tarefa só pode ser agendada quando todas as anteriores do
mesmo projeto já foram 100% alocadas. (Ou seja: no máximo 1 tarefa "pronta"
por projeto de cada vez.)

**4.4 Ranking de urgência do projeto** (menor = mais urgente)
Ordene os projetos por, nesta ordem exata:
1. Com prazo antes de sem prazo.
2. Entre os com prazo: **prazo mais próximo primeiro** (earliest-deadline-first).
3. Empate: prioridade (`alta` < `media` < `baixa`).
4. Empate: `createdAt` mais antigo primeiro.
5. Empate final: `id` (ordem alfabética) — garante determinismo total.

> Por que prazo vem antes de prioridade? Porque cumprir prazo é matematicamente
> o objetivo principal, e "earliest-deadline-first" é a estratégia ótima pra
> isso quando dá pra dividir tarefas (que é o nosso caso). Prioridade só
> desempata entre prazos iguais e ordena os projetos sem prazo.

---

## 5. O algoritmo (núcleo)

```
função generateSchedule(input):
    blocks = []
    date = hoje
    horizon = hoje + maxHorizonDays
              // Os prazos NÃO param o loop — ele aloca TODAS as tarefas
              // (até o teto de maxHorizonDays). O prazo é só um checkpoint
              // usado depois, na seção 6, pra checar o que passou dele.

    enquanto (existe tarefa com restante > 0) E (date <= horizon):
        para cada period em periodosDoDia(date) na ordem [manha, tarde, noite]:
            cap = capacidadeEfetiva(date, period)
            enquanto cap > 0:
                task = proximaTarefaPronta()   // ver 4.3 + 4.4
                se task == null: break          // nada pronto pra alocar agora
                chunk = min(restante(task), cap)

                // guarda anti-sliver: não cria pedaço menor que minBlock,
                // A NÃO SER que esse pedaço conclua a tarefa
                se chunk < minBlockMinutes E chunk < restante(task):
                    break   // deixa o resto do período como folga extra

                blocks.push({ taskId: task.id, date, period, minutes: chunk })
                task.actualMinutes += chunk    // (cópia local; não muta o input)
                cap -= chunk
        date = date + 1 dia

    // pós-processamento: viabilidade e datas de término (seções 6 e 7)
    return montarResultado(blocks, input)
```

Pontos que o Claude Code **não pode** trocar:
- A ordem de preenchimento dos períodos é cronológica (`manha, tarde, noite`).
- A escolha da tarefa é sempre por 4.3 + 4.4 (nunca aleatória, nunca "a que
  sobrou").
- A guarda anti-sliver evita blocos de 3 min soltos.

---

## 6. Viabilidade e as 3 saídas

Depois de alocar, para **cada projeto com prazo**:

```
minutosDepoisDoPrazo =
   soma dos blocks desse projeto cuja date > deadline
 + restante ainda não alocado do projeto ao fim do loop

se minutosDepoisDoPrazo > 0:
   projeto é INVIÁVEL, com deficitMinutes = minutosDepoisDoPrazo
```

As 3 saídas de um projeto inviável (todas advisory, calculadas por conta):
- **esticarPrazoAte**: a `date` do **último bloco** desse projeto no plano.
  Como o loop agora aloca tudo (não para no prazo), esse bloco sempre existe,
  e é a data real em que o projeto terminaria.
- **adicionarMinutosPorDia**: `ceil(deficitMinutes / diasDisponiveis)`, onde
  `diasDisponiveis = max(1, diasEntre(hoje, deadline) + 1)` (conta de hoje até
  o prazo, inclusive). O `max(1, ...)` garante que nunca divide por zero
  quando o prazo é hoje ou já passou.
- **cortarEscopoMinutos**: `= deficitMinutes` — quanto de trabalho precisaria
  sair pra caber.

`feasible` do resultado = `infeasibleProjects.length === 0`.

> Importante: mesmo inviável, `blocks` volta preenchido com o **melhor plano
> possível** (o usuário ainda vê o que dá pra fazer). A inviabilidade é um
> aviso honesto, não um erro que trava a tela.

---

## 7. Projetos sem prazo → data de término prevista

Projetos sem `deadline` nunca são "inviáveis". Para cada um (e também para os
com prazo), preencha `projectedCompletion[projectId]` = a `date` do último
bloco daquele projeto no plano. É o que alimenta o "sem prazo, o app sugere
uma data de conclusão realista" do PRD.

---

## 8. Replanejamento = rodar o MESMO algoritmo

Não existe um segundo algoritmo pra replanejar. Replanejar é chamar
`generateSchedule` de novo com o estado atualizado:
- `hoje` = a nova data atual;
- `task.actualMinutes` = o tempo já executado (então `restante` já desconta o
  que foi feito);
- tarefas concluídas com `done = true` (saem da fila);
- dias passados **não** entram (o loop começa em `hoje`), então o histórico
  nunca é reescrito.

> Isso é de propósito: um algoritmo só, testado uma vez, serve tanto pro plano
> inicial quanto pra cada replanejamento. Menos código, menos bug.

---

## 9. Peak matching (tarefa pesada no bloco de pico) — adiado pra v2

No MVP o preenchimento é cronológico e **ignora** `isPeak` e `difficulty`.

**Por quê adiar:** colocar a tarefa pesada no pico pode competir com o
earliest-deadline-first e, se mal feito, empurrar uma tarefa urgente pra
depois — furando prazo. Fazer isso *sem* arriscar prazo exige regras extras
que são difíceis de testar. Como o núcleo precisa ser provadamente correto,
peak matching entra depois, como refinamento, com seus próprios testes.

**Stub previsto pra v2:** uma função `preferPeakForHeavy(blocks)` que, num
segundo passe, troca de período tarefas `pesada` com tarefas `leve` do
**mesmo dia** quando isso não muda o dia de nenhuma tarefa (troca segura, sem
afetar prazo). Deixar a assinatura pronta, sem implementar.

---

## 10. Casos de borda (todos devem ter teste)

1. Sem disponibilidade nenhuma → `blocks` vazio; todo projeto com prazo vira
   inviável; sem prazo, `projectedCompletion` vazio/indefinido.
2. Tarefa maior que qualquer período isolado → deve ser **dividida** entre
   períodos/dias.
3. Última fração de uma tarefa menor que `minBlockMinutes` → **pode** ser
   alocada (a guarda anti-sliver só bloqueia quando NÃO conclui a tarefa).
4. Dois projetos com o mesmo prazo → desempate por prioridade, depois
   `createdAt`, depois `id` (determinístico).
5. Projeto com prazo no passado (deadline < hoje) → imediatamente inviável,
   deficit = total restante do projeto.
6. `actualMinutes >= estimatedMinutes` → tarefa tratada como concluída
   (restante 0), não gera bloco.
7. Prazo exatamente no limite (cabe com 0 de folga além do buffer) → viável.

---

## 11. Exemplos resolvidos (seed dos testes do passo c)

> Nos dois exemplos: disponibilidade **igual todo dia** — manhã 1h, tarde 2h,
> noite 3h. `bufferPct = 0.20`, `minBlockMinutes = 15`.
> Capacidades efetivas: manhã **48**, tarde **96**, noite **144** (288/dia).
> Datas nomeadas D1 (hoje), D2, D3...

### Exemplo A — cabe no prazo (feasible)
- Projeto A: deadline **D3**, prioridade alta. Tarefas: A1=180min, A2=120min.
- Projeto B: **sem prazo**, prioridade média. Tarefa: B1=90min.

Alocação esperada:
- **D1** manhã 48→A1 | tarde 96→A1 (A1: 48+96=144, restam 36) | noite: 36→A1
  (A1 concluída) + 108→A2 (A2 restam 12).
- **D2** manhã: 12→A2 (conclui A2; 12<15 mas finaliza, então vale) + 36→B1
  (sobram 36 de capacidade e B1 já está pronta) | tarde: 54→B1 (B1 concluída)
  + 42 de folga | noite: nada.

> ⚠️ Atenção ao preenchimento do período: o laço `enquanto cap > 0` do §5
> **não para quando uma tarefa conclui** — ele chama `proximaTarefaPronta()` de
> novo e continua preenchendo o mesmo período enquanto houver capacidade e
> tarefa pronta. Por isso os 36 min que sobram na manhã do D2 recebem B1, em
> vez de virarem folga. A guarda anti-sliver não bloqueia aqui porque
> 36 ≥ `minBlockMinutes`.
- `feasible = true`. `projectedCompletion`: A=D2, B=D2. Tudo antes de D3. ✅

### Exemplo B — não cabe (infeasible)
- Projeto C: deadline **D1** (só hoje), prioridade alta. Tarefa: C1=400min.

O loop aloca C1 inteira (não para no prazo): **D1** manhã 48 + tarde 96 +
noite 144 (=288) e **D2** manhã 48 + tarde 64 (=112) — concluindo em D2.
Como o prazo de C é D1, os **112 min que caíram em D2 estão depois do prazo**:
- `deficitMinutes = 112` → `feasible = false`.
  - `esticarPrazoAte = D2` (data do último bloco de C).
  - `adicionarMinutosPorDia = 112` (deficit ÷ diasDisponiveis; como o prazo é
    hoje, `diasDisponiveis = 1`).
  - `cortarEscopoMinutos = 112`.
- `blocks` traz o plano completo (o melhor possível); os blocos de D2 são os
  que marcam o que passou do prazo. ✅

---

## 12. Checklist de testes a escrever (passo c)

- [ ] capacidade efetiva aplica o buffer corretamente (2h, 20% → 96)
- [ ] nenhum dia/período recebe mais minutos que sua capacidade efetiva
- [ ] tarefa grande é dividida entre períodos e dias
- [ ] ordem dentro do projeto é respeitada (A2 nunca antes de A1 terminar)
- [ ] earliest-deadline-first: projeto de prazo mais próximo é alocado primeiro
- [ ] desempates (prioridade → createdAt → id) são determinísticos
- [ ] Exemplo A reproduz exatamente os blocos esperados
- [ ] Exemplo B marca inviável com deficit 112 e as 3 saídas corretas
- [ ] guarda anti-sliver: não cria bloco < 15 min que não conclui tarefa;
      cria quando conclui
- [ ] replanejamento com actualMinutes desconta o já feito e não mexe no passado
- [ ] todos os casos de borda da seção 10

---

*Especificação gerada em Agosto 2026 — Gustavo / projeto Cadence.*

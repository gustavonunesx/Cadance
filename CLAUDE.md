# CLAUDE.md — Cadence

> Arquivo de contexto do projeto para o Claude Code. É lido no início de toda
> sessão. Ele diz **como trabalhar neste repositório**. O **o quê** construir
> está no `PRD_Cadence.md` — leia o PRD antes de implementar qualquer feature.

---

## 1. O que é o Cadence (resumo de 30 segundos)

Software pessoal que transforma o `.md` de um projeto (contexto + passo a passo
+ checklist) em um **cronograma diário realista**. O usuário informa a rotina
disponível (horas de manhã/tarde/noite) e um prazo; o app distribui as tarefas
pelos dias sem sobrecarregar, e oferece um modo foco com cronômetro.

Detalhes completos: ver `PRD_Cadence.md`.

---

## 2. Stack

- **Framework:** Next.js 15 (App Router) + React + TypeScript
- **Estilo:** Tailwind CSS + shadcn/ui
- **Banco / auth:** Supabase (Postgres)
- **IA:** Claude API (modelo Sonnet) — usada SÓ para analisar o `.md` e estimar
  duração de tarefas. Ver a regra de ouro na seção 5.
- **Testes:** Vitest
- **Deploy:** Vercel

---

## 3. Comandos

```bash
npm run dev        # sobe o servidor de desenvolvimento
npm run build      # build de produção
npm run test       # roda os testes (Vitest)
npm run test:watch # testes em watch mode (usar durante o desenvolvimento)
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (checagem de tipos)
```

> Antes de considerar qualquer tarefa concluída, `npm run test`, `npm run lint`
> e `npm run typecheck` precisam passar.

---

## 4. Estrutura de pastas (convenção)

```
/src
  /app            # rotas (App Router) — 1 pasta por tela do PRD
    /hoje         # tela "Hoje" (principal)
    /cronograma   # visão de semana/calendário
    /foco         # modo foco (cronômetro)
    /projetos     # lista de projetos + progresso
    /rotina       # config de disponibilidade
    /importar     # upload do .md + prazo + prioridade
  /components      # componentes de UI reutilizáveis (shadcn em /components/ui)
  /lib
    /scheduler    # ⭐ o algoritmo de distribuição (código puro, testável)
    /ai           # chamadas à Claude API (extração/estimativa)
    /supabase     # client e queries
  /types           # tipos TypeScript compartilhados
/tests             # testes do Vitest (espelham a estrutura de /src)
```

---

## 5. ⭐ REGRA DE OURO (a mais importante do projeto)

**A IA estima. O algoritmo distribui. Nunca inverta isso.**

- A Claude API é usada **apenas** para: ler o `.md`, quebrar em tarefas e
  estimar a duração de cada uma (`estimated_minutes`).
- A distribuição das horas nos dias é feita por **código determinístico** em
  `/src/lib/scheduler` — **nunca** por um prompt de IA.
- Motivo: modelos de linguagem erram aritmética. Um cronograma que não fecha na
  conta (aloca mais horas do que o usuário tem) destrói a confiança no app
  inteiro. A conta é responsabilidade do código, e o código é coberto por
  testes.

Se em algum momento a solução mais fácil parecer "pedir pra IA montar o
cronograma", **pare** — isso viola a regra de ouro. Extraia com a IA, distribua
com o algoritmo.

---

## 6. Regras invioláveis do algoritmo (`/src/lib/scheduler`)

Toda essa lógica é código puro e **precisa ter teste** (ver seção 8):

1. **Nunca alocar mais horas do que o disponível** em um dado dia/período.
2. **Folga de segurança:** nunca preencher 100% do tempo disponível — reservar
   a margem configurável (padrão 15–20%).
3. **Checagem de viabilidade:** antes de retornar um cronograma, comparar horas
   necessárias × horas disponíveis até o prazo. Se não couber, retornar um
   resultado de **inviabilidade** (com as 3 saídas: esticar prazo / adicionar
   horas / cortar escopo) em vez de um plano irreal.
4. **Replanejamento só olha pra frente:** ao reequilibrar, redistribuir de hoje
   em diante; nunca reescrever dias passados.
5. **Tarefa pesada no bloco de pico** quando o usuário marcou um período como
   pico.

---

## 7. Convenções de código

- **TypeScript estrito** — sem `any`. Tipar entradas e saídas do scheduler.
- **Funções do scheduler são puras** — recebem dados, retornam dados, sem
  efeito colateral e sem chamar banco/IA lá dentro (facilita testar).
- **pt-BR** em toda string visível ao usuário e em datas/durações (ex: "1h30",
  "40 min").
- **Nomes de variáveis e funções em inglês**; comentários podem ser em pt-BR.
- Componentes shadcn/ui em `/components/ui`; não reescrever do zero o que o
  shadcn já entrega.

---

## 8. Fluxo de trabalho esperado (o loop do harness)

Trabalhe **em fatias pequenas**, seguindo a ordem de build do PRD (seção 9 do
`PRD_Cadence.md`). Para cada fatia:

1. Implemente a fatia.
2. Escreva/rode os testes (`npm run test`).
3. Rode `npm run lint` e `npm run typecheck`.
4. Só siga para a próxima fatia quando os três passarem.

**Não construa o app inteiro de uma vez.** Uma fatia por vez, verificada.

Para a lógica do scheduler especificamente, trabalhe **guiado por testes**:
escreva primeiro os casos (ex: "4h disponíveis + 3 tarefas → nenhum dia passa
de 4h"), depois o código que os faz passar.

---

## 9. O que NUNCA fazer

- ❌ Pedir para a IA somar/distribuir horas (viola a regra de ouro).
- ❌ Mostrar a lista completa de tarefas na tela "Hoje" — ela mostra só hoje.
- ❌ Empacotar o dia a 100% (a folga de segurança é obrigatória).
- ❌ Esconder o alerta de inviabilidade de prazo — é a informação mais
  importante quando aparece.
- ❌ Commitar chaves/segredos. Supabase e Claude API vêm de variáveis de
  ambiente (`.env.local`), nunca hardcoded.
- ❌ Marcar uma tarefa como concluída sem os testes/lint/typecheck passando.

---

## 10. Variáveis de ambiente

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # só no servidor, nunca exposto ao cliente
ANTHROPIC_API_KEY=           # só no servidor
```

---

*Manter este arquivo atualizado conforme o projeto evolui. Se uma convenção
mudar, mude aqui também.*
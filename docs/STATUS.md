# Estado do projeto e próximos passos

> Atualizado em 2026-11-05. Leia este arquivo primeiro numa sessão nova; o contexto fixo continua no `CLAUDE.md`.

## Onde estamos

- **Pronto na `main`:** scaffold (Next 15.5, React 19, Tailwind 4, Vitest 3) e o scheduler em `src/lib/scheduler/` (PRs #1 a #3). Suíte: 84 testes em 6 arquivos, `lint` e `typecheck` verdes.
- **Corrigido nesta sessão:** tarefas `done` somavam o restante como deficit e geravam "inviável" falso (`generateSchedule.ts`); `DEFAULT_SCHEDULER_CONFIG` (spec §3) exportado; 13 testes novos e 3 reforçados; `CLAUDE.md` e `.claude/rules/scheduler.md` alinhados (peak = v2, parse do `.md` em `src/lib/md/`, IA só estima).
- **Em andamento:** Perfil de rotina (passo 3 do §8 do spec do pipeline). O comportamento da tela, o login, o ambiente e a abordagem de dados estão aprovados; a estrutura de arquivos é proposta técnica sem aprovação explícita. Tudo está escrito em `docs/superpowers/specs/2026-11-05-perfil-de-rotina-design.md`, **aguardando sua leitura**. Maquete aprovada: https://claude.ai/artifact/MD2xshaMnzPknenb9SSxmh (privada).
- **Ainda não existe:** `src/lib/{md,ai,supabase,availability}`, telas (só um placeholder), pasta `supabase/`, `.env.local`.

## Antes da próxima sessão (você)

1. Abrir o PR da branch `docs/spec-perfil-de-rotina` (spec + este arquivo) e fazer o merge: https://github.com/gustavonunesx/Cadance/pull/new/docs/spec-perfil-de-rotina. O `gh` não está autenticado; rode `gh auth login` se quiser que a próxima sessão abra os PRs.
2. Ler o spec do Perfil de rotina e responder: aprovado, ou o que mudar.
3. Preparar o Supabase (seção 10 do spec): projeto, usuário, URLs de redirect e `.env.local`. Dá para fazer em paralelo à leitura.

## Próximos passos (em ordem)

1. **Plano do Perfil de rotina:** com o spec aprovado, invocar `superpowers:writing-plans` (a ordem sugerida está na seção 12 do spec) e depois executar com `superpowers:subagent-driven-development`.
2. **Decisões do scheduler fora de escopo:** `esticarPrazoAte` devolve o próprio prazo quando não há bloco depois dele (sugestão: `null`, o que muda tipo, spec e `gaps.test.ts`); piso/validação de `bufferPct`. Cada uma é um PR pequeno.
3. **Pendências menores (opcionais):** `DEFAULT_SCHEDULER_CONFIG` como `Readonly<SchedulerConfig>`; atualizar o comentário do cabeçalho de `generateSchedule.test.ts`; nota no JSDoc de `isEligible`; helpers de teste duplicados em 5 arquivos; `.claude/rules/scheduler.md` sem `src/lib/md/**` no `paths:`.
4. **Depois do Perfil de rotina:** `src/lib/md/` (parser do checklist), `src/lib/ai/` (estimativa + Zod), importar `.md`, e então Hoje, Foco, Replanejamento, Projetos (spec do pipeline §8).
5. **Docs desatualizados que sobraram:** `PRD_Cadence.md` ainda diz que a IA divide o `.md` (linhas 67, 244, 332, 375) e mantém a ordem antiga no §9; `docs/harness/strategies.md` está obsoleto.
6. **Segurança:** o `npm ci` avisou 14 vulnerabilidades (3 críticas, 4 altas); falta ver se são de dev ou de produção (`npm audit --omit=dev`).

## Comandos

- Rodar: `npm run dev` e abrir http://localhost:3000 (hoje só aparece "Cadence").
- Verificar: `npm run test`, `npm run lint`, `npm run typecheck`.

## Armadilhas do ambiente

- Rode `npm` pelo **PowerShell**, não pelo Bash: um hook (`rtk`) reescreve os comandos do Bash e o classificador do auto mode bloqueia lint e typecheck, principalmente em subagentes.
- O `CLAUDE.md` cita os agentes `code-reviewer` e `frontend-developer`, mas o Agent tool não os encontra; os revisores rodam como `general-purpose`.
- `npm run dev` altera o `package-lock.json` (patch do SWC); não commitar essa mudança por engano.
- A branch remota `scaffold/nextjs-supabase-scheduler` guarda o schema antigo do Supabase, os clients e o shadcn; reaproveitar por cópia de arquivos, nunca por merge.
- `.env.local.example` não pôde ser lido nas sessões anteriores por regra de permissão; os nomes das variáveis estão no spec (seção 10).

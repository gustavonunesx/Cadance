# Perfil de rotina — design

> Passo 3 do §8 do [spec do pipeline](2026-09-16-cadence-pipeline-ia-design.md) (PRD §9, item 1). Critério do spec: "disponibilidade grava e lê".
> Status: **rascunho para revisão do dono**, 2026-11-05. Depois da aprovação, o próximo passo é `superpowers:writing-plans`. Nenhum código foi escrito.

## 1. Resumo em linguagem simples

- Você ganha uma tela de **login** (e-mail + link) e uma tela **Rotina**, onde informa quantas horas livres tem em cada período (manhã, tarde, noite) de cada dia da semana e pode marcar um período como pico.
- Isso fica salvo no Supabase (nuvem) e é lido de volta no formato que o scheduler já usa. Celular e desktop veem os mesmos dados.
- Fora deste passo: importar `.md`, IA, projetos, tela Hoje.
- O que depende de você: criar o projeto no Supabase, criar seu usuário e preencher o `.env.local` (seção 10).
- A maquete da tela foi aprovada em 2026-11-05 (artefato privado do claude.ai: https://claude.ai/artifact/MD2xshaMnzPknenb9SSxmh).

## 2. Objetivo e critério de sucesso

Você informa as horas livres por dia da semana × período, com marca de pico; o app grava e devolve `AvailabilitySlot[]` (tipo do scheduler) sem adaptação. Pronto quando:

1. O login por e-mail funciona e nenhuma rota além de `/login` e `/auth/*` abre sem sessão.
2. Salvar, recarregar e abrir em outro aparelho mostra os mesmos valores.
3. `getAvailability` devolve 21 `AvailabilitySlot` que `generateSchedule` aceita como `availability`.
4. `npm run test`, `npm run lint` e `npm run typecheck` verdes, mais o roteiro manual da seção 9.

## 3. Decisões (confirmadas com o dono em 2026-11-05; a estrutura de arquivos da seção 5 é proposta técnica, ainda sem aprovação explícita)

| Tema | Decisão | Por quê |
| --- | --- | --- |
| Autenticação | Supabase Auth, login por e-mail com link mágico, só para usuário já existente (`shouldCreateUser: false`); cadastro público desligado no painel | Celular e desktop precisam dos mesmos dados; `.claude/rules/06-security.md` exige autenticação para dado protegido |
| Ambiente | Projeto Supabase na nuvem; migrations em `supabase/migrations/` | Mesmo ambiente do deploy na Vercel, sem Docker |
| Acesso a dados | Server Components para ler, Server Action para gravar; RLS como segunda barreira | Sem camada de API, pouco JS no cliente, validação no servidor |
| Layout | Um cartão por dia: 1 coluna no celular, 2 a partir de 640 px, 7 colunas a partir de 1100 px | Alvos de toque grandes no celular; semana inteira no desktop |
| Horas | Passos de 30 min, máximo 12 h por período e 24 h por dia | Evita valores sem sentido sem travar uso real |
| Pico | Estrela por período; o dado é guardado e ainda não influencia a distribuição | PRD regra crítica nº 4 e `scheduler-spec.md` §9 (v2) |
| Margem | Fica o `DEFAULT_SCHEDULER_CONFIG` (20%); não configurável neste passo | YAGNI; a margem configurável entra depois |
| Primeiro acesso | Tudo zerado e nada preenchido por padrão | O app não inventa horas |
| Ordem dos dias | Segunda a domingo na tela; `weekday` no banco segue 0 = domingo | Semana de planejamento; contrato do scheduler preservado |

## 4. Fora do escopo

Importar `.md` e IA; tabelas `projects`, `tasks`, `schedule_blocks`, `focus_sessions` (cada uma chega com seu slice; `tasks` ainda precisa de `difficulty` e `needs_clarification`, spec do pipeline §2.4); tela Hoje; margem configurável; totais da semana; copiar um dia para outros; PWA/offline; cadastro de novos usuários; manter valores não salvos quando a sessão expira; edição simultânea em dois aparelhos (a última gravação vence).

## 5. Estrutura de arquivos

| Caminho | Responsabilidade |
| --- | --- |
| `supabase/migrations/<timestamp>_availability.sql` | Só a tabela `availability` (seção 6). `supabase/config.toml` vem de `npx supabase init`. |
| `src/lib/env.ts` | Lê e valida as variáveis de ambiente (Zod); falha cedo com mensagem clara. Substitui os `process.env.X!` da branch antiga. |
| `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts` | Clients do navegador e do servidor e o helper que renova a sessão. Base: `origin/scaffold/nextjs-supabase-scheduler` (cópia dos arquivos, não merge). |
| `src/middleware.ts` | Renova a sessão; sem sessão vai para `/login`; com sessão, `/login` vai para `/rotina`. |
| `src/app/login/` (`page.tsx`, `actions.ts`) e `src/app/auth/callback/route.ts` | Formulário de e-mail; troca o código do link pela sessão e redireciona. |
| `src/lib/availability/` (`schema.ts`, `mapping.ts`, `queries.ts`, `index.ts`) | Puro e testável: validação Zod, conversão linhas ↔ `AvailabilitySlot[]`, leitura e gravação recebendo o client por parâmetro. |
| `src/app/rotina/` (`page.tsx`, `routine-form.tsx`, `actions.ts`) | Página que lê (Server Component), grade (Client Component) e Server Action que valida e grava. |
| `src/app/page.tsx` | Passa a redirecionar para `/rotina` até a tela Hoje existir. |
| shadcn | `components.json`, `src/lib/utils.ts` e só os componentes usados (base: a mesma branch antiga). |
| Dependências | `@supabase/ssr`, `@supabase/supabase-js`, `zod` e as do shadcn; exatas no plano. |

## 6. Banco

```sql
create table availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6), -- 0 = domingo
  period text not null check (period in ('manha', 'tarde', 'noite')),
  hours numeric not null default 0 check (hours >= 0 and hours <= 12),
  is_peak boolean not null default false,
  unique (user_id, weekday, period)
);

alter table availability enable row level security;

create policy "Usuário gerencia sua própria disponibilidade"
  on availability for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

Mudanças em relação ao rascunho do PRD: `user_id` obrigatório e preenchido pelo banco com `auth.uid()` (o cliente nunca o envia), `unique (user_id, weekday, period)` para o upsert, limites de `hours`. O passo de 30 min e o limite de 24 h por dia ficam na validação do app, porque o banco não vê as 3 linhas do dia juntas e o passo pode mudar.

## 7. Código

- Tipos: reusa `AvailabilitySlot` e `Period` de `@/lib/scheduler`. Linha do banco: `{ weekday, period, hours, is_peak }`.
- `rowsToSlots(rows)`: sempre devolve 21 slots, ordenados por `weekday` 0..6 e por `manha`, `tarde`, `noite`, **sem depender da ordem do banco** (`order by period` alfabético daria manhã, noite, tarde). Linha ausente vira `hours: 0, isPeak: false`.
- `slotsToRows(slots)`: o inverso, sem `user_id`.
- `availabilitySchema` (Zod): exatamente 21 pares `(weekday, period)` únicos; `hours` múltiplo de 0,5 entre 0 e 12; soma do dia ≤ 24; `isPeak` booleano. Mensagens em pt-BR.
- `getAvailability(supabase)`: `select` das linhas do usuário (a RLS filtra) e `rowsToSlots`.
- `saveAvailability(supabase, slots)`: um `upsert` das 21 linhas com `onConflict: 'user_id,weekday,period'`.
- `safeRedirectPath(next)` (puro): só aceita caminho relativo iniciado por `/` (e não `//`); qualquer outra coisa vira `/rotina`.

## 8. Fluxos, erros e segurança

- **Login:** `/login` pede o e-mail e chama `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: <origem>/auth/callback } })`. A resposta é sempre "Se esse e-mail estiver cadastrado, enviamos um link" (não revela se o usuário existe). O link leva a `/auth/callback?code=…`, que chama `exchangeCodeForSession` e redireciona para `safeRedirectPath(next)`.
- **Rotina:** `page.tsx` lê no servidor e entrega os 21 slots à grade. "Salvar" chama a Server Action `saveRoutine(slots)`: valida com Zod, grava com `saveAvailability`, chama `revalidatePath('/rotina')` e devolve `{ ok: true }` ou `{ ok: false, message }`.
- **Estados da tela** (como na maquete): preenchida; primeiro acesso (tudo zerado + "Ainda não há nada salvo…"); salvando (botão desabilitado); salvo ("Rotina salva"); erro ("Não foi possível salvar agora…", mantendo o que está na tela).
- **Erros:** valor inválido volta como mensagem em pt-BR; falha do Supabase vira mensagem genérica na tela e o detalhe vai para o log do servidor; sessão expirada leva ao `/login`.
- **Segurança:** RLS por `auth.uid()`; `user_id` nunca vem do formulário; só a chave pública (anon) vai ao navegador; `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY` não são usadas neste passo; `.env.local` fora do git; cadastro público desligado.

## 9. Testes e verificação

Automáticos (Vitest), só o que pode quebrar: `mapping` (21 slots, ordem, zeros, pico, linha ausente); `schema` (passo, limites por período e por dia, pares duplicados ou faltando); `queries` com um client falso (o `upsert` recebe 21 linhas, com `onConflict` correto e sem `user_id`); `safeRedirectPath` (`//evil.com`, URL absoluta, vazio). Sem testes de aparência nem de middleware (cola de framework, coberta pelo roteiro).

Roteiro manual (dono): `npm run dev`, entrar pelo link do e-mail, preencher, salvar, recarregar (persistiu), abrir em outro aparelho (mesmos dados), tentar abrir `/rotina` sem sessão (cai no login).

## 10. Preparação que depende do dono

1. Criar um projeto em supabase.com (região South America).
2. Authentication → Providers → Email: desligar "Allow new users to sign up".
3. Authentication → Users → Add user, com o seu e-mail.
4. Authentication → URL Configuration: Site URL `http://localhost:3000` e Redirect URL `http://localhost:3000/auth/callback` (a URL da Vercel entra no deploy).
5. Settings → API: copiar a Project URL e a anon key para o `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
6. Aplicar a migration: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push` (ou colar o SQL do arquivo no SQL Editor).

## 11. Riscos

- **PKCE:** o link mágico só funciona no mesmo navegador que pediu o login. Se isso atrapalhar no celular, trocar por código de 6 dígitos (`verifyOtp`); muda só o formulário de login e o template do e-mail.
- **E-mail:** o provedor padrão do Supabase tem limite baixo de envios por hora. A sessão persiste, então o impacto é pequeno; se incomodar, configurar SMTP próprio.
- **Upsert sem `user_id`:** depende do `default auth.uid()` valer antes da checagem de conflito. O roteiro manual confirma; se falhar, a Server Action passa a enviar o `user_id` da sessão (`getUser()`).
- **`numeric`:** conferir que o `hours` chega como número no `supabase-js`; senão converter no `rowsToSlots`.
- **`next dev`** pode alterar o `package-lock.json` (patch do SWC); não commitar por engano.

## 12. Ordem sugerida para o plano

1. Dependências, shadcn base e `env.ts`.
2. `src/lib/availability/` puro, com TDD (`mapping`, `schema`, `safeRedirectPath`).
3. Migration e helpers do Supabase (`queries.ts` com client falso).
4. Login: `login`, `auth/callback`, `middleware`.
5. Tela Rotina: `page`, `routine-form`, `actions`.
6. Documentar a preparação (seção 10) e rodar o roteiro manual.

As tarefas 2 e 3 não compartilham arquivos; as demais dependem delas.

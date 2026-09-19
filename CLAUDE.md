# Cadance

> Project memory for Claude Code. Keep this file short and high-signal —
> bloated memory gets ignored. Put hard guarantees in hooks, not prose.

## Behavioral guidelines
<!-- aia-harness:behavioral — non-negotiable; do not edit, reorder, or remove during enrichment -->

1. **Think before coding** — state assumptions explicitly; if multiple interpretations exist, present them instead of picking silently; say so when a simpler approach exists; if something is unclear, stop and ask.
2. **Simplicity first** — minimum code that solves the problem. No speculative features, no abstractions for single-use code, no unrequested configurability, no error handling for impossible scenarios. If 200 lines could be 50, rewrite.
3. **Surgical changes** — touch only what the request requires; match existing style; don't refactor, reformat, or "improve" adjacent code. Remove orphans *your* change created; leave pre-existing dead code alone (mention it, don't delete it). Every changed line should trace directly to the user's request.
4. **Goal-driven execution** — turn tasks into verifiable goals ("fix the bug" → "write a test that reproduces it, then make it pass"). For multi-step work, state a brief plan with a verify check per step, then loop until verified.
5. **Main session = orchestrator — it does not implement.** Plan, decide, coordinate; ALL delegable implementation and analysis goes to a specialist subagent via `Agent`, parallel when scopes don't conflict.

## Stack
Next.js 15 (App Router) + React + TypeScript · Tailwind CSS + shadcn/ui ·
Supabase (Postgres, auth) · Claude API (Sonnet) · Vitest · deployed to Vercel.

Architecture: **single Next.js app**.

## Canonical commands
Always use these exact commands (do not guess):

- `npm run dev` — development server
- `npm run build` — production build
- `npm run test` — Vitest · `npm run test:watch` during development
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`

`test`, `lint` and `typecheck` must all pass before any task counts as done.

## Workflow & Agents

Invoke `superpowers:subagent-driven-development` for **non-trivial** implementation — trigger it when the request meets **≥2** of:

- touches **3+ files** or **2+ domains/layers** (UI + agent, API + DB…)
- is a **new feature / epic / cross-cutting refactor** (not a one-line or single-function change)
- needs a **multi-step plan** or ordered tasks, each with its own verification
- has **unclear scope or root cause** and needs exploration before coding

Skip it — implement inline — for typo/copy fixes, single-function edits, config tweaks, or one-file bugs with an obvious cause.

When dispatching subagents, you MUST use the matching specialist agent from the table below — never the generic agent when a specialist is listed. Cross-reference the task type with the "When to use" column and pass the exact name as `subagent_type`.

Model dispatch: an agent's frontmatter `model` wins; a generic dispatch or a project/user agent with no `model` in frontmatter is force-set to `sonnet` by a PreToolUse hook, so it never silently inherits this session's model — except namespaced plugin agents (`plugin:name`), left unrewritten since their frontmatter isn't reliably hook-resolvable. Pass `model` explicitly yourself for those, or to override for complex work: `haiku` for search/exploration, `sonnet` for implementation, `opus` for architectural judgment — cheapest tier that fits.

| Agent | When to use |
|---|---|
| `code-reviewer` | Reviews any code change for bugs, security, error handling, and test coverage. Use proactively after editing any source file. MUST BE USED before merging a pull request. |
| `frontend-developer` | Builds and reviews frontend applications (React/Vue/Angular), component architecture, and state management. |

Only the agents listed above are installed. The `agents` category was **not**
applied during `/aia-harness:init`, so the ag-kit specialists (`orchestrator`,
`debugger`, `test-engineer`, `database-architect`, `security-auditor`, …) do not
exist here — dispatching one fails. Install them with `/aia-harness:init` (select
the `agents` group) and restore the rows above in the same change.

### Superpowers → Project Specialists (mandatory bridging)
<!-- aia-harness:agent-routing — superpowers→specialist bridge; do not remove -->

Superpowers skills (`superpowers:dispatching-parallel-agents`, `superpowers:subagent-driven-development`,
`superpowers:executing-plans`, `superpowers:systematic-debugging`) show `general-purpose` as the default
`subagent_type` in their examples. **Never dispatch `general-purpose` (or a generic
implementer) when a specialist below covers the domain** — pass the specialist's exact
name as `subagent_type` instead.

> Basis: superpowers itself states "User's explicit instructions (CLAUDE.md) — highest
> priority." This section applies that priority over the agent types its examples suggest.
> The normal flow is unchanged (`superpowers:brainstorming` → `superpowers:writing-plans` → `superpowers:subagent-driven-development`);
> only the dispatched `subagent_type` changes.

| When superpowers would use `general-purpose` for… | Dispatch instead |
|---|---|
| Review / audit changed code | `code-reviewer` |
| Frontend / component / state-management work | `frontend-developer` |

Every other domain has no specialist installed here — fall back to
`general-purpose` until the `agents` category is applied (see above).

### Parallel wave execution (subagent-driven-development)
<!-- aia-harness:parallel-sdd — parallel wave execution override; do not remove -->

Override `superpowers:subagent-driven-development`'s serial one-implementer-at-a-time default with
parallel waves of independent tasks. Its "never dispatch implementers in parallel" red flag is
superseded here because its two premises are removed: disjoint file ownership per wave, and
controller-serialized commits instead of implementer self-commits. During planning, tag each task
`Files:` / `Depends-on:`; batch tasks with disjoint `Files` and no mutual dependency into one wave,
and dispatch their implementers in a single message using the specialist types from the table above.
Keep the skill's implementer/reviewer prompt contracts intact — the only change is implementers do
NOT self-commit. Untagged or uncertain tasks run serial (no regression). Full protocol:
`.claude/rules/08-parallel-subagent-driven-development.md`.

## Architecture map
<!-- AI-ENRICH: analyze file tree and key source dirs, describe module responsibilities and relationships, replace this section -->

> **Planned layout — not built yet.** The repo currently holds only this harness
> and `README.md`. Create directories as each slice lands.

- `src/app/` — App Router, one folder per PRD screen: `hoje` (main), `cronograma`,
  `foco`, `projetos`, `rotina`, `importar`.
- `src/lib/scheduler/` — ⭐ the distribution algorithm. Pure, deterministic,
  fully tested. Never calls the DB or the AI.
- `src/lib/ai/` — Claude API calls: parse the `.md`, split into tasks, estimate
  `estimated_minutes`. Feeds the scheduler; never schedules.
- `src/lib/supabase/` — client + queries.
- `src/components/` — reusable UI; shadcn primitives stay in `components/ui/`.
- `src/types/` — shared TypeScript types.
- `tests/` — Vitest, mirroring `src/`.

Specs at the repo root, read before implementing:

- `PRD_Cadence.md` — what to build (screens, flows, build order).
- `scheduler-spec.md` — exact algorithm spec for `src/lib/scheduler/`; the tests
  validate against its §11 examples.
- `generateSchedule.test.ts` — written against that spec; move to
  `tests/lib/scheduler/` and make it pass (needs the `@` → `src` alias in
  `vitest.config`).

## Conventions
<!-- AI-ENRICH: detect project-specific patterns from source files; replace the placeholder below with 4-7 concrete, project-specific conventions. Keep each convention to 1-2 lines; if one needs more detail, move the detail to a path-scoped rule in .claude/rules/ (paths: frontmatter) and keep a one-line pointer here — CLAUDE.md loads every session, rules load lazily. Leave the "## Behavioral guidelines" and "## Engineering rules" sections untouched — those are fixed and must survive enrichment. -->

- ⭐ **GOLDEN RULE — the AI estimates, the algorithm distributes. Never invert it.**
  Claude API only reads the `.md`, splits it into tasks, and estimates
  `estimated_minutes`. Spreading hours across days is deterministic code in
  `src/lib/scheduler/` — never a prompt. Language models get arithmetic wrong, and
  a schedule that over-allocates destroys trust in the whole app. If "just ask the
  AI to build the schedule" starts looking easiest, **stop** — that is the violation.
- **Scheduler invariants** (all of it pure code, all of it tested — full detail:
  `.claude/rules/scheduler.md`): never allocate beyond a day's available hours;
  always keep the 15–20% safety margin; return an explicit *infeasible* result
  (stretch deadline / add hours / cut scope) rather than an unreal plan;
  replanning only ever moves forward from today; heavy tasks go in a peak block.
- **Strict TypeScript, no `any`** — scheduler inputs and outputs fully typed.
  Scheduler functions stay pure: data in, data out, no DB or AI calls inside.
- **pt-BR for every user-visible string**, including dates and durations
  ("1h30", "40 min"). Identifiers in English; comments may be pt-BR.
- **Work in small slices**, in PRD build order: implement → `npm run test` →
  `npm run lint` → `npm run typecheck` → only then the next slice. Never build the
  whole app in one pass. Scheduler logic is written test-first.
- **Never**: show the full task list on the "Hoje" screen (today only) · pack a day
  to 100% · hide an infeasibility alert · hardcode Supabase/Anthropic keys (they
  live in `.env.local`) · mark a task done with tests, lint or typecheck failing.

## Engineering rules
<!-- aia-harness:fixed — non-negotiable; do not edit, reorder, or remove during enrichment -->

- Match the style of surrounding code; do not introduce new patterns unprompted.
- Test what can break — business rules, branching logic, money/security/auth, bug regressions; skip trivial getters, wrappers, config, presentational UI (rubric: `.claude/rules/05-testing.md`).
- Run the lint + test commands above before claiming work is complete.
- Never commit secrets; keep them in gitignored env files (`.env`/`.env.local`) — `.claude/settings.local.json` is only for MCP-server credentials referenced by `.mcp.json`.
- Fix every compilation/syntax/lint error found during a session — regardless of whether you edited the file. Never leave the build broken or label errors "pre-existing, not related".
- When performing a code review (user requests it or a workflow triggers it), always use `code-reviewer`. (`security-reviewer` and the `uncle-bob-craft` skill are not installed in this project — install the `agents` / `skills` groups via `/aia-harness:init` to use them.)
- Environment secrets (`NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) live in `.env.local` only. `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are server-side only — never expose either to the client.

@.claude/memory/INSTRUCTIONS.md
@.claude/memory/MEMORY.md
<!-- Generated by aia-harness. Edit freely; re-run /aia-harness:doctor to audit. -->

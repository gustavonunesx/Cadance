# Scheduler Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the defects and test gaps an audit found in `src/lib/scheduler/`: export the spec §3 defaults as code, remove a phantom deficit caused by `done` tasks, and pin eight untested behaviors with exact-value tests.

**Architecture:** One small constants module, one small production fix in `buildResult` (deficit sum filtered by `isEligible`); everything else is test code. The scheduler stays pure and deterministic: no DB, no AI, no clock. Three tasks, strictly linear.

**Tech Stack:** TypeScript (strict), Vitest 3, ESLint (`next/core-web-vitals` + `next/typescript`). No new dependencies.

**Spec:** `scheduler-spec.md` (§3, §4.1, §4.2, §6, §7, §8, §10, §11, §12) is binding. `docs/superpowers/specs/2026-09-16-cadence-pipeline-ia-design.md` (§4.4, §5) covers flagged tasks and the known debts.

**Baseline (verified before planning):** `npm run test` 69/69 in 5 files; `npm run lint` and `npm run typecheck` clean. Test count: 69 (Task 1 changes none) → 71 (Task 2) → 84 (Task 3).

## Global Constraints

- Golden rule: the AI estimates, the algorithm distributes. Nothing in `src/lib/scheduler/` calls a DB, an AI or the network, and nothing reads a clock (no `Date.now()`); all dates are fixed `'YYYY-MM-DD'` fixtures.
- Strict TypeScript: no `any`, no non-null `!`, no new type casts (the existing `as Period` in `generateSchedule.test.ts` stays untouched).
- Tests first (RED, then GREEN) wherever behavior changes (Task 2). Task 1 is a pure refactor and Task 3 characterizes existing behavior: neither has a RED step (A4).
- Every task ends green on `npm run test`, `npm run lint` and `npm run typecheck` (lint and typecheck: exit 0, no errors and no warnings).
- Test rubric `.claude/rules/05-testing.md`: public API only, deterministic, exact values (`toBe` / `toEqual`), no tautologies, no implementation-detail assertions.
- User-visible strings are pt-BR (none are added here); test titles and comments follow the existing pt-BR style.
- Surgical changes: touch only what each task lists; leave pre-existing dead code alone.
- Defaults (scheduler-spec §3): `bufferPct = 0.20`, `minBlockMinutes = 15`, `maxHorizonDays = 365`.
- Weekday `0=domingo ... 6=sábado` (types.ts, `weekdayOf`); period fill order `['manha', 'tarde', 'noite']`.
- Peak matching is v2: `preferPeakForHeavy` is a deliberate identity stub (scheduler-spec §9) — not a bug and not in scope.

## Review Focus

Failure modes a user of the planner is most likely to hit, most likely first. Each is pinned by a test in the task that owns the code:

1. A task marked done after taking less time than estimated (the normal case): the project must not turn infeasible on the leftover estimate. — Task 2
2. Replanning mid-project with a partly done task (45 of 120 min done): only the 75 remaining minutes are scheduled, from today on. — Task 3b
3. A project whose deadline already passed: "add minutes per day" must be the whole deficit, never `Infinity` or negative. — Task 3f
4. A routine with availability on only some weekdays and today on an unavailable day: blocks start on the next available weekday and never land on an excluded one. — Task 3d
5. A user with no routine yet and a project without a deadline: empty plan, `feasible` true, no completion date, no crash. — Task 3a

---

## Assumptions

Decisions taken without asking (the brief allowed no questions). Every expected number in this plan was produced by running the real code on a scratch copy outside the repo (A14).

- **A1 Helpers stay file-local.** Each existing test file declares its own `availabilityEveryDay` / `task` / `project`; `doneTasks.test.ts` copies the minimal set the same way. A shared helper module would refactor five files for no requested behavior.
- **A2 `DEFAULT_SCHEDULER_CONFIG` is a plain `SchedulerConfig` object** — not frozen, not `as const`, no factory. The per-file constants it replaces were identical and unfrozen, nothing mutates it (Task 3e proves the scheduler never mutates its input), and tests that need a variation spread it. Task 3e builds its frozen input from a spread copy so deep-freezing never freezes the shared constant.
- **A3 `capacity.test.ts` and `ordering.test.ts` checked:** neither redeclares `DEFAULT_CONFIG`. The literal `0.2` arguments in `capacity.test.ts` are explicit inputs of a pure function that pin the §4.1 formula; they stay literals (tying them to the default would make them lie if the default ever changed).
- **A4 No RED step for Tasks 1 and 3.** Task 1 is a pure refactor; Task 3's tests describe behavior that already exists and pass on first run. To prove they can fail, each new test was shown to go red under at least one one-line production mutation on a scratch copy (table at the end of Task 3).
- **A5 Fix style (Task 2) — controller ruling R1:** filter the deficit sum with `isEligible(task, progress)` instead of adding a second hand-written guard. Results are identical to `task.done || task.needsClarification` (an eligible task is not done, not flagged, and has remaining > 0), but "counts toward the plan" then has a single definition shared with the allocation loop — the duplicated exclusion list is how this bug appeared. The planner's mutation evidence was gathered with the explicit guard; Step 2's RED run is the proof for this variant.
- **A6 Task 2's second test (done and flagged) passes before the fix.** Flagged tasks are already skipped by the deficit loop and `unestimatedTasks` already filters `!task.done`. `unestimated.test.ts` cannot express `done: true` (its `task()` helper hard-codes `done: false`), so that branch had no test. It stays as a characterization test beside the regression.
- **A7 (3a) uses `availability: []`** ("no routine yet"). The existing edge test already covers zero-hour slots for a project with a deadline.
- **A8 (3c) numbers** come from `Math.floor(hours * 60 * (1 - bufferPct))` and were confirmed by running the code: 2h gives 96 at 0.20 and 102 at 0.15, so a 120-min task splits 96 + 24 and 102 + 18 (both remainders are at least `minBlockMinutes` and complete the task, so the anti-sliver guard stays out of it). Both values are exact in IEEE-754, but `floor` is fragile for other pairs (1.5h at 0.30 gives 62, spec arithmetic says 63; always the safe side, never over-allocates): out of scope (see Out of scope); run the code before adding table rows.
- **A9 (3d) dates:** 2026-08-21 is sexta (5), 08-24 segunda (1), 08-25 terça (2), 08-26 quarta (3), 08-31 segunda (1); confirmed with `weekdayOf`.
- **A10 (3f) the row "deadline equal to today" is dropped.** It duplicates the existing Example B test (`adicionarMinutosPorDia` 112 with `diasDisponiveis` 1). The `Math.max(1, …)` clamp only matters for deadlines before today: yesterday gives a raw divisor of 0 (`Infinity` without the clamp) and nine days ago gives −8 (−12). Rows: yesterday and 9 days ago. `esticarPrazoAte` is asserted nowhere in this plan.
- **A11 (3g) `projectedCompletion` for Example B.** The five blocks are listed explicitly in §11 and asserted exactly. The example has no literal `projectedCompletion:` line (Example A does); it says "concluindo em D2" and §7 defines the field as the last block's date, so `'2026-08-20'` is asserted. Drop that single assertion for a strictly literal reading.
- **A12 (3h) scope of "strengthen".** The brief says "the never over-allocate test" (singular); the `capacidade efetiva e buffer` describe holds two tests with the same two defects, so both are strengthened, plus the past-days replanning test. No other existing test is touched.
- **A13 Commits.** Implementers do not commit (parallel-wave rule, `.claude/rules/08-parallel-subagent-driven-development.md`); the controller runs each task's commit step. Subjects follow repo history (conventional prefix, pt-BR).
- **A14 Verification method.** Baseline, Task 1 refactor, Task 2 RED/GREEN and every Task 3 case were executed on a scratch mirror of `src/lib/scheduler/` and `tests/lib/scheduler/` (tests, `tsc`, `eslint`) before this plan was written; no repo file was touched.

## Out of scope

- Changing the `esticarPrazoAte` contract when no block exists after the deadline (pending owner decision). The `gaps.test.ts` assertion that pins today's fallback to the deadline stays untouched, and no new test asserts `esticarPrazoAte`.
- `bufferPct` validation or a floor (design decision pending with the owner). Observed while planning, not acted on: `Math.floor(hours * 60 * (1 - bufferPct))` can lose one minute to IEEE-754 rounding (A8); it only under-allocates, so it belongs to that same decision.
- `ScheduleBlock.status`, the "never completes" sentinel for deadline-less projects past `maxHorizonDays`, and the 365-day spin with zero availability (known debts, pipeline spec §5).
- Peak matching (v2): no test about peak placement (`.claude/rules/scheduler.md`, invariant 5).
- Input validation (`orderIndex` duplicates or gaps, `estimatedMinutes <= 0`, negative `hours`).
- Coverage tooling.
- Permutation-invariance of the order of `infeasibleProjects` / `unestimatedTasks`.
- Extracting the duplicated test helpers into a shared module (A1).

## File Structure

| File | Task | Change |
| --- | --- | --- |
| `src/lib/scheduler/config.ts` | 1 | New: `DEFAULT_SCHEDULER_CONFIG` |
| `src/lib/scheduler/index.ts` | 1 | One re-export |
| `tests/lib/scheduler/generateSchedule.test.ts`, `gaps.test.ts`, `unestimated.test.ts` | 1 | Import the constant, delete the local `DEFAULT_CONFIG` |
| `tests/lib/scheduler/doneTasks.test.ts` | 2 | New: regression for the phantom deficit (+2 tests) |
| `src/lib/scheduler/generateSchedule.ts` | 2 | `neverAllocated` filtered by `isEligible` in `buildResult` (+ import) |
| `tests/lib/scheduler/capacity.test.ts` | 3 | +4 tests |
| `tests/lib/scheduler/gaps.test.ts` | 3 | +2 tests |
| `tests/lib/scheduler/generateSchedule.test.ts` | 3 | +7 tests, 3 strengthened |

---

## Task 1: Export the spec §3 defaults as DEFAULT_SCHEDULER_CONFIG

**Files:**
- Create: `src/lib/scheduler/config.ts`
- Modify: `src/lib/scheduler/index.ts`
- Modify: `tests/lib/scheduler/generateSchedule.test.ts`, `tests/lib/scheduler/gaps.test.ts`, `tests/lib/scheduler/unestimated.test.ts`

**Depends-on:** none

**Interfaces:**
- Consumes: `SchedulerConfig` from `src/lib/scheduler/types.ts` (fields `bufferPct`, `minBlockMinutes`, `maxHorizonDays`).
- Produces: `DEFAULT_SCHEDULER_CONFIG: SchedulerConfig`, importable from `@/lib/scheduler`. Tasks 2 and 3 import it.

**Context:** Three test files each redeclare the same `DEFAULT_CONFIG`, and the spec §3 values have no home in code. This is a pure refactor: no behavior change and no new test (a constant has no logic to break; rubric `05-testing.md`). Do not add validation or a floor for `bufferPct` (Out of scope).

- [ ] **Step 1: Create `src/lib/scheduler/config.ts`**

```ts
import type { SchedulerConfig } from './types';

/** Valores padrão da scheduler-spec §3 — a folga de 20% é o buffer de segurança. */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  bufferPct: 0.2,
  minBlockMinutes: 15,
  maxHorizonDays: 365,
};
```

- [ ] **Step 2: Re-export it as the first line of `src/lib/scheduler/index.ts`**

```diff
+export { DEFAULT_SCHEDULER_CONFIG } from './config';
 export { generateSchedule } from './generateSchedule';
 export { preferPeakForHeavy } from './preferPeakForHeavy';
```

- [ ] **Step 3: Swap the three test files to the exported constant**

In each file: import the constant, delete the local `const DEFAULT_CONFIG: SchedulerConfig = { ... };` declaration (plus one adjacent blank line), and drop `SchedulerConfig` from the type import — it was only used by that declaration, and leaving it raises a `@typescript-eslint/no-unused-vars` warning.

`tests/lib/scheduler/generateSchedule.test.ts`:

```diff
-import { generateSchedule } from '@/lib/scheduler';
+import { DEFAULT_SCHEDULER_CONFIG, generateSchedule } from '@/lib/scheduler';
 import type {
   Period,
   Priority,
   Difficulty,
   Task,
   Project,
   AvailabilitySlot,
-  SchedulerConfig,
   ScheduleBlock,
 } from '@/lib/scheduler';
@@
-const DEFAULT_CONFIG: SchedulerConfig = {
-  bufferPct: 0.2,
-  minBlockMinutes: 15,
-  maxHorizonDays: 365,
-};
-
```

`tests/lib/scheduler/gaps.test.ts`:

```diff
-import { generateSchedule } from '@/lib/scheduler';
+import { DEFAULT_SCHEDULER_CONFIG, generateSchedule } from '@/lib/scheduler';
 import type {
   AvailabilitySlot,
   Project,
-  SchedulerConfig,
   Task,
 } from '@/lib/scheduler';
-
-const DEFAULT_CONFIG: SchedulerConfig = {
-  bufferPct: 0.2,
-  minBlockMinutes: 15,
-  maxHorizonDays: 365,
-};
```

`tests/lib/scheduler/unestimated.test.ts`:

```diff
-import { generateSchedule, preferPeakForHeavy } from '@/lib/scheduler';
+import {
+  DEFAULT_SCHEDULER_CONFIG,
+  generateSchedule,
+  preferPeakForHeavy,
+} from '@/lib/scheduler';
 import type {
   AvailabilitySlot,
   Project,
   ScheduleBlock,
-  SchedulerConfig,
   Task,
 } from '@/lib/scheduler';
-
-const DEFAULT_CONFIG: SchedulerConfig = {
-  bufferPct: 0.2,
-  minBlockMinutes: 15,
-  maxHorizonDays: 365,
-};
```

Then rename the remaining usages (17, 5 and 4 respectively; `{ ...DEFAULT_CONFIG, maxHorizonDays: 2 }` spreads included) with a whole-word replace, from the repo root in Git Bash:

```bash
sed -i 's/\bDEFAULT_CONFIG\b/DEFAULT_SCHEDULER_CONFIG/g' tests/lib/scheduler/generateSchedule.test.ts tests/lib/scheduler/gaps.test.ts tests/lib/scheduler/unestimated.test.ts
```

The replace only renames `config:` arguments; in `gaps.test.ts` the assertion that pins `esticarPrazoAte` to the deadline is not touched. `capacity.test.ts` and `ordering.test.ts` need no change (A3).

- [ ] **Step 4: Verify nothing changed behaviorally**

Run: `git grep -nw DEFAULT_CONFIG -- src tests`
Expected: no output.

Run: `npm run test`
Expected: `Test Files  5 passed (5)`, `Tests  69 passed (69)`.

Run: `npm run lint` — Expected: exit 0, no errors, no warnings.
Run: `npm run typecheck` — Expected: exit 0, no errors.

- [ ] **Step 5: Commit (controller)**

```bash
git add src/lib/scheduler/config.ts src/lib/scheduler/index.ts tests/lib/scheduler/generateSchedule.test.ts tests/lib/scheduler/gaps.test.ts tests/lib/scheduler/unestimated.test.ts
git commit -m "refactor: exportar DEFAULT_SCHEDULER_CONFIG (spec §3) e usar nos testes"
```

---

## Task 2: Stop done tasks from inflating the deficit (bug fix, TDD)

**Files:**
- Create: `tests/lib/scheduler/doneTasks.test.ts`
- Modify: `src/lib/scheduler/generateSchedule.ts` (the `neverAllocated` reduce in `buildResult`, lines 84-90)

**Depends-on:** 1

**Interfaces:**
- Consumes: `DEFAULT_SCHEDULER_CONFIG` (Task 1), `generateSchedule`, and the types `AvailabilitySlot`, `Project`, `Task` from `@/lib/scheduler`.
- Produces: no new symbol. Behavior change: the deficit no longer counts the leftover of `done` tasks. Task 3's numbers assume it.

**Context:** `isEligible` (`ordering.ts:18-22`) never allocates a `done` task, so its leftover `estimatedMinutes − actualMinutes` can never shrink. `buildResult` sums `remainingMinutes` for every task except `needsClarification`, so a task finished faster than estimated — the normal case — adds a phantom deficit to any project with a deadline. Verified on the current code: a project due 2026-08-25 with one done task (estimate 120, actual 30) and one 60-min task that fits comfortably on the first day comes back `infeasible` with `deficitMinutes: 90`, `adicionarMinutosPorDia: 13`, `cortarEscopoMinutos: 90`: a false alert and wrong advice. Scheduler-spec §4.2: tasks with `done = true` are ignored.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/scheduler/doneTasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SCHEDULER_CONFIG, generateSchedule } from '@/lib/scheduler';
import type { AvailabilitySlot, Project, Task } from '@/lib/scheduler';

function availabilityEveryDay(manha: number, tarde: number, noite: number): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    slots.push({ weekday, period: 'manha', hours: manha, isPeak: false });
    slots.push({ weekday, period: 'tarde', hours: tarde, isPeak: false });
    slots.push({ weekday, period: 'noite', hours: noite, isPeak: false });
  }
  return slots;
}

function task(
  id: string,
  projectId: string,
  orderIndex: number,
  estimatedMinutes: number,
  opts: { actualMinutes?: number; done?: boolean; needsClarification?: boolean } = {},
): Task {
  return {
    id,
    projectId,
    orderIndex,
    estimatedMinutes,
    actualMinutes: opts.actualMinutes ?? 0,
    difficulty: 'media',
    done: opts.done ?? false,
    needsClarification: opts.needsClarification,
  };
}

function project(id: string, deadline: string | null, tasks: Task[]): Project {
  return { id, deadline, priority: 'alta', createdAt: '2026-01-01', tasks };
}

// ---------------------------------------------------------------------------
// scheduler-spec §4.2 — tarefa `done` é ignorada, sobre o que for o restante
// ---------------------------------------------------------------------------

describe('tarefas concluídas (done) não geram deficit', () => {
  it('concluída mais rápido que o estimado não torna o projeto inviável', () => {
    // D: estimada 120, só 30 gastos, marcada concluída (restante bruto = 90, que
    // nunca será alocado). T: 60 min, cabe folgado em D1 antes do prazo.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', '2026-08-25', [
          task('D', 'P', 0, 120, { actualMinutes: 30, done: true }),
          task('T', 'P', 1, 60),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toEqual([]);
    // Blocos só da tarefa pendente: manhã 48 + tarde 12 (a fração final conclui).
    expect(result.blocks).toEqual([
      { taskId: 'T', date: '2026-08-19', period: 'manha', minutes: 48 },
      { taskId: 'T', date: '2026-08-19', period: 'tarde', minutes: 12 },
    ]);
  });

  it('concluída e também sem estimativa não vira alerta nem deficit', () => {
    // X foi marcada sem estimativa pela IA, mas o usuário a concluiu: não há o
    // que perguntar (unestimatedTasks) nem o que somar (deficit).
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', '2026-08-25', [
          task('X', 'P', 0, 90, { done: true, needsClarification: true }),
          task('T', 'P', 1, 60),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    expect(result.unestimatedTasks).toEqual([]);
    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toEqual([]);
    expect(result.blocks.some((block) => block.taskId === 'X')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm RED**

Run: `npx vitest run tests/lib/scheduler/doneTasks.test.ts`
Expected: the first test fails and the second passes (A6):

```
 ❯ tests/lib/scheduler/doneTasks.test.ts (2 tests | 1 failed)
   × tarefas concluídas (done) não geram deficit > concluída mais rápido que o estimado não torna o projeto inviável
     → expected false to be true // Object.is equality
   ✓ tarefas concluídas (done) não geram deficit > concluída e também sem estimativa não vira alerta nem deficit
 ...
 AssertionError: expected false to be true // Object.is equality
   58|     expect(result.feasible).toBe(true);
 Tests  1 failed | 1 passed (2)
```

If it fails anywhere else, or both tests fail, stop and read the output before touching production code.

- [ ] **Step 3: Apply the minimal fix in `src/lib/scheduler/generateSchedule.ts`**

```diff
     // O que nem chegou a ser alocado (horizonte estourado, sem disponibilidade)
-    // também é deficit. Tarefas flagueadas são excluídas — sem estimativa, não
-    // há número honesto para contar (pipeline-spec §4.4).
+    // também é deficit. Só conta o que o laço ainda poderia alocar (isEligible):
+    // tarefas concluídas — mesmo antes do estimado (scheduler-spec §4.2) — e
+    // flagueadas — sem estimativa, não há número honesto (pipeline-spec §4.4) —
+    // ficam de fora.
-    const neverAllocated = project.tasks.reduce((sum, task) => {
-      if (task.needsClarification) return sum;
-      return sum + remainingMinutes(task, progress);
-    }, 0);
+    const neverAllocated = project.tasks
+      .filter((task) => isEligible(task, progress))
+      .reduce((sum, task) => sum + remainingMinutes(task, progress), 0);
```

Also add `isEligible` to the existing named import from `./ordering` at the top of the file (keep the names already imported). `isEligible` is exported by `ordering.ts` and is the same predicate the allocation loop uses, so "counts toward the plan" has one definition (controller ruling R1 — see A5). No other line changes.

- [ ] **Step 4: Confirm GREEN and the full gate**

Run: `npx vitest run tests/lib/scheduler/doneTasks.test.ts` — Expected: `Tests  2 passed (2)`.
Run: `npm run test` — Expected: `Test Files  6 passed (6)`, `Tests  71 passed (71)`.
Run: `npm run lint` — Expected: exit 0, no errors, no warnings.
Run: `npm run typecheck` — Expected: exit 0, no errors.

The RED run in Step 2 is the proof that the first test guards this fix.

- [ ] **Step 5: Commit (controller)**

```bash
git add tests/lib/scheduler/doneTasks.test.ts src/lib/scheduler/generateSchedule.ts
git commit -m "fix: tarefa concluída não entra no deficit (spec §4.2)"
```

---

## Task 3: Close the audit's test gaps (characterization tests)

**Files:**
- Modify: `tests/lib/scheduler/capacity.test.ts`
- Modify: `tests/lib/scheduler/gaps.test.ts`
- Modify: `tests/lib/scheduler/generateSchedule.test.ts`

**Depends-on:** 1, 2

**Interfaces:**
- Consumes: `DEFAULT_SCHEDULER_CONFIG` (Task 1) and the type `SchedulerInput` from `@/lib/scheduler`; the post-Task-2 `buildResult`.
- Produces: nothing. This task adds no production code.

**Context:** Eight audit findings, cases (a) to (h). Each case was checked against the cited spec section and the real code before its numbers were written. These tests describe behavior that already exists and should pass on first run. **If a new test fails, do not change production code in this task.** Re-derive the number by hand from the cited spec section; if the spec confirms the test, report `BLOCKED` with the actual-versus-expected output so the controller can rule; if your derivation shows the plan's number is wrong, fix the test and say so in your report. Do not touch the `gaps.test.ts` assertion that pins `esticarPrazoAte` to the deadline.

Fixture helpers to reuse, all already in the file you edit:
- `generateSchedule.test.ts`: `availabilityEveryDay(manha, tarde, noite)`, `task(id, projectId, orderIndex, estimatedMinutes, { actualMinutes, done })`, `project(id, deadline, priority, tasks, createdAt?)`, `canonical`, `minutesByTask`, `minutesByDatePeriod`, `CAP`.
- `gaps.test.ts`: `availabilityEveryDay`, `task(id, projectId, estimatedMinutes)`, `project(id, deadline, tasks)`.
- `capacity.test.ts`: the module-level `availability` (every weekday: manhã 1h, tarde 2h, noite 3h).

- [ ] **Step 1: `capacity.test.ts` — cases 3c (unit) and 3d (unit)**

Inside `describe('effectiveCapacity')`, right after the 20% test (3c: the buffer is a parameter, not a fixed 0.8; §4.1: `floor(120 × 0.85)` = 102):

```ts
  it('usa o buffer recebido, não um valor fixo (2h de tarde com 15% => 102 min)', () => {
    expect(effectiveCapacity('2026-08-19', 'tarde', availability, 0.15)).toBe(102);
  });
```

New `describe` at the end of the file (3d: slots of other weekdays or periods are ignored; 0=domingo ... 6=sábado):

```ts
describe('effectiveCapacity — escolha do slot', () => {
  // 2026-08-24 é segunda (1), 25 terça (2), 19 quarta (3).
  const slots: AvailabilitySlot[] = [
    { weekday: 1, period: 'tarde', hours: 1, isPeak: false },
    { weekday: 3, period: 'tarde', hours: 2, isPeak: false },
    { weekday: 3, period: 'manha', hours: 3, isPeak: false },
  ];

  it('usa o slot do dia da semana e do período pedidos', () => {
    expect(effectiveCapacity('2026-08-19', 'tarde', slots, 0.2)).toBe(96);
    expect(effectiveCapacity('2026-08-19', 'manha', slots, 0.2)).toBe(144);
    expect(effectiveCapacity('2026-08-24', 'tarde', slots, 0.2)).toBe(48);
  });

  it('ignora slots de outros dias da semana (terça => 0)', () => {
    expect(effectiveCapacity('2026-08-25', 'tarde', slots, 0.2)).toBe(0);
  });

  it('ignora slots de outros períodos do mesmo dia (quarta à noite => 0)', () => {
    expect(effectiveCapacity('2026-08-19', 'noite', slots, 0.2)).toBe(0);
  });
});
```

- [ ] **Step 2: `gaps.test.ts` — case 3f (§6: `diasDisponiveis = max(1, …)`; rows explained in A10)**

Add a new `describe` right after the `adicionarMinutosPorDia arredonda para cima` describe and before `maxHorizonDays`. Assert only `deficitMinutes`, `adicionarMinutosPorDia` and `cortarEscopoMinutos` — never `esticarPrazoAte`.

Given: `today = '2026-08-19'`, availability `availabilityEveryDay(1, 2, 3)`, one 100-min task, deadline set in the past by the table rows. When: `generateSchedule`. Then: all 100 minutes land on D1 (manhã 48, tarde 52), after the deadline, so the deficit is 100 and `diasDisponiveis` clamps to 1:

```ts
describe('adicionarMinutosPorDia com prazo vencido', () => {
  // diasDisponiveis = max(1, diasEntre(hoje, prazo) + 1): prazo ontem => max(1, 0),
  // há 9 dias => max(1, -8); ambos 1. Sem o max: ceil(100/0) = Infinity e ceil(100/-8) = -12.
  it.each([
    { quando: 'ontem', deadline: '2026-08-18' },
    { quando: 'há 9 dias', deadline: '2026-08-10' },
  ])('prazo $quando: o aporte diário é o deficit inteiro, nunca Infinity nem negativo', ({ deadline }) => {
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', deadline, [task('T', 'P', 100)])],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_SCHEDULER_CONFIG,
    });

    expect(result.infeasibleProjects).toHaveLength(1);
    const { deficitMinutes, options } = result.infeasibleProjects[0];
    expect(deficitMinutes).toBe(100);
    expect(options.adicionarMinutosPorDia).toBe(100);
    expect(options.cortarEscopoMinutos).toBe(100);
  });
});
```

- [ ] **Step 3: `generateSchedule.test.ts` — six new cases (a, b, c, d, e, g)**

First add `SchedulerInput` to the existing `import type { ... } from '@/lib/scheduler'` list. Then:

**3a — §10.1 and §7: no deadline, no availability (A7).** Inside `describe('casos de borda')`, after the zero-hours test. Given: `today = '2026-08-19'`, one project `P` with `deadline: null`, one 60-min task, `availability: []`. Then: no blocks, viable, no completion date.

```ts
  it('sem prazo e sem disponibilidade: plano vazio, viável e sem data de término', () => {
    // ... generateSchedule({ today: '2026-08-19', projects: [project('P', null, 'media', [task('T', 'P', 0, 60)])], availability: [], config: DEFAULT_SCHEDULER_CONFIG })
    expect(result.blocks).toEqual([]);
    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toEqual([]);
    expect(result.projectedCompletion).toEqual({});
  });
```

**3b — §8: replanning with partial progress.** Inside `describe('replanejamento')`, after the past-dates test. Given: `today = '2026-08-20'`, project `P` (deadline `'2026-08-31'`, priority `'alta'`, createdAt `'2026-08-01'`) with task `T`: estimate 120, `actualMinutes: 45`; availability `availabilityEveryDay(1, 0, 0)` (48 min each morning). Then only the 75 remaining minutes are scheduled, starting today. The exact dates also prove nothing is dated before today; if the remainder ignored `actualMinutes` the plan would be 48 + 48 + 24 through 2026-08-22.

```ts
  it('com progresso parcial, aloca só o restante a partir de hoje', () => {
    // ... generateSchedule(...) as described in Given
    expect(canonical(result.blocks)).toEqual([
      { taskId: 'T', date: '2026-08-20', period: 'manha', minutes: 48 },
      { taskId: 'T', date: '2026-08-21', period: 'manha', minutes: 27 },
    ]);
    expect(minutesByTask(result.blocks).get('T')).toBe(75);
    expect(result.projectedCompletion['P']).toBe('2026-08-21');
  });
```

**3c — §4.1: safety-margin boundary, exact values (A8).** Inside `describe('capacidade efetiva e buffer')`, after the (strengthened) second test. A 2h afternoon (120 min) would land on exactly 100% without the buffer. Given: availability `availabilityEveryDay(0, 2, 0)`, project `P` without deadline, task `T` of 120 min, `today = '2026-08-19'`, config `{ ...DEFAULT_SCHEDULER_CONFIG, bufferPct }`. Then:

```ts
  it.each([
    { bufferPct: 0.2, dia1: 96, dia2: 24 },
    { bufferPct: 0.15, dia1: 102, dia2: 18 },
  ])(
    'tarefa de 120 min numa tarde de 2h com folga $bufferPct => $dia1 + $dia2',
    ({ bufferPct, dia1, dia2 }) => {
      // ... generateSchedule(...) as described in Given
      expect(canonical(result.blocks)).toEqual([
        { taskId: 'T', date: '2026-08-19', period: 'tarde', minutes: dia1 },
        { taskId: 'T', date: '2026-08-20', period: 'tarde', minutes: dia2 },
      ]);
    },
  );
```

**3d — weekday availability, integration (A9).** New `describe('disponibilidade em dias da semana alternados')` at the end of the file. Given: `today = '2026-08-21'` (sexta, weekday 5); availability `availabilityEveryDay(1, 0, 0).filter((slot) => slot.weekday === 1 || slot.weekday === 3)` (only segunda and quarta, 48 min each morning); project `P` without deadline, task `T` of 100 min. Then the first block lands on the next available weekday and nothing lands on sexta (today), terça, quinta, sábado or domingo:

```ts
  it('hoje é sexta sem disponibilidade: o primeiro bloco cai na próxima segunda e nenhum em dia excluído', () => {
    // ... generateSchedule(...) as described in Given
    expect(canonical(result.blocks)).toEqual([
      { taskId: 'T', date: '2026-08-24', period: 'manha', minutes: 48 }, // segunda
      { taskId: 'T', date: '2026-08-26', period: 'manha', minutes: 48 }, // quarta
      { taskId: 'T', date: '2026-08-31', period: 'manha', minutes: 4 }, // segunda (4 < 15, mas conclui)
    ]);
  });
```

**3e — §1 and §5: the input is never mutated.** Add this helper after `canonical` (no `any`, no cast: `unknown` plus the `typeof` narrowing), and a new `describe('imutabilidade da entrada')` at the end of the file:

```ts
/** Congela o valor e tudo que ele contém: qualquer escrita na entrada lança TypeError. */
function deepFreeze(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  for (const child of Object.values(value)) deepFreeze(child);
  Object.freeze(value);
}
```

```ts
describe('imutabilidade da entrada', () => {
  it('roda com a entrada congelada em profundidade e a deixa idêntica', () => {
    // Cobre os caminhos de alocação, tarefa concluída e inviabilidade (C estoura o prazo).
    const input: SchedulerInput = {
      today: '2026-08-19',
      projects: [
        project('A', '2026-08-21', 'alta', [
          task('A1', 'A', 0, 180, { actualMinutes: 30 }),
          task('A2', 'A', 1, 120),
        ]),
        project('B', null, 'media', [
          task('B1', 'B', 0, 40, { actualMinutes: 40, done: true }),
          task('B2', 'B', 1, 90),
        ]),
        project('C', '2026-08-19', 'baixa', [task('C1', 'C', 0, 500)]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      // Cópia: congelar a entrada não pode congelar a constante compartilhada.
      config: { ...DEFAULT_SCHEDULER_CONFIG },
    };
    const before = structuredClone(input);
    deepFreeze(input);

    expect(() => generateSchedule(input)).not.toThrow();
    expect(input).toEqual(before);
  });
});
```

**3g — §11 Example B: exact blocks.** Add one `it` at the end of `describe('Exemplo B do spec — não cabe no prazo')`, reusing that describe's shared `result` (A11). Then: D1 manhã 48 + tarde 96 + noite 144 (=288) and D2 manhã 48 + tarde 64 (=112), finishing in D2:

```ts
  it('reproduz os blocos do spec e conclui em D2', () => {
    const expected: ScheduleBlock[] = [
      { taskId: 'C1', date: '2026-08-19', period: 'manha', minutes: 48 },
      { taskId: 'C1', date: '2026-08-19', period: 'tarde', minutes: 96 },
      { taskId: 'C1', date: '2026-08-19', period: 'noite', minutes: 144 },
      { taskId: 'C1', date: '2026-08-20', period: 'manha', minutes: 48 },
      { taskId: 'C1', date: '2026-08-20', period: 'tarde', minutes: 64 },
    ];
    expect(canonical(result.blocks)).toEqual(canonical(expected));
    expect(result.projectedCompletion['C']).toBe('2026-08-20');
  });
```

- [ ] **Step 4: `generateSchedule.test.ts` — case 3h, strengthen three weak tests (A12)**

Two defects shared by the first two: the loop iterates a Map, so it passes vacuously when `blocks` is empty, and `<=` tolerates under-allocation. Edit only the assertions; fixtures stay.

1. `nunca aloca mais que a capacidade efetiva (2h tarde, buffer 20% => 96 max)` — replace the comment and the `for` loop (the one with `toBeLessThanOrEqual(96)` and the two unreachable `manha` / `noite` assertions) with:

```ts
    // 5000 min / 96 = 52 tardes cheias (4992) + 8 min na 53ª (2026-10-10), que
    // conclui a tarefa. Cada tarde sai em exatamente 96 — nunca 120 (100% das 2h).
    const used = minutesByDatePeriod(result.blocks);
    expect(used.size).toBe(53);
    for (const [key, minutes] of used) {
      expect(key.endsWith('|tarde')).toBe(true); // manhã e noite não têm capacidade
      expect(minutes).toBe(key === '2026-10-10|tarde' ? 8 : 96);
    }
```

2. `nenhum período em nenhum dia ultrapassa sua capacidade efetiva` — replace the `for` loop (the one with `toBeLessThanOrEqual(CAP[period])`) with the following; the `as Period` line is the pre-existing one, kept as is:

```ts
    // 4000 min = 13 dias cheios (13 × 288 = 3744) + 256 no 14º dia (48 + 96 + 112):
    // 14 × 3 períodos, todos na capacidade efetiva exata, menos a última noite.
    const used = minutesByDatePeriod(result.blocks);
    expect(used.size).toBe(42);
    for (const [key, minutes] of used) {
      const period = key.split('|')[1] as Period;
      expect(minutes).toBe(key === '2026-09-01|noite' ? 112 : CAP[period]);
    }
```

3. `nunca agenda em datas passadas (só de hoje pra frente)` — insert before its `for` loop (200 min fit entirely on today: manhã 48 + tarde 96 + noite 56):

```ts
    // Sem esta checagem o laço abaixo passaria vazio se nenhum bloco fosse gerado.
    expect(result.blocks).toHaveLength(3);
```

- [ ] **Step 5: Run the touched suites and read every result**

Run: `npx vitest run tests/lib/scheduler/capacity.test.ts tests/lib/scheduler/gaps.test.ts tests/lib/scheduler/generateSchedule.test.ts`
Expected: all pass — `capacity` 18, `gaps` 7, `generateSchedule` 29 tests. Any failure follows the rule in Context (no production change).

- [ ] **Step 6: Full gate**

Run: `npm run test` — Expected: `Test Files  6 passed (6)`, `Tests  84 passed (84)`.
Run: `npm run lint` — Expected: exit 0, no errors, no warnings.
Run: `npm run typecheck` — Expected: exit 0, no errors.
Run: `git status --short` — Expected: this task touched only the three test files above, nothing under `src/`.

- [ ] **Step 7: Commit (controller)**

```bash
git add tests/lib/scheduler/capacity.test.ts tests/lib/scheduler/gaps.test.ts tests/lib/scheduler/generateSchedule.test.ts
git commit -m "test: fechar lacunas do scheduler (spec §4.1, §6, §8, §10.1, §11)"
```

**Kill-check evidence** (planner-run on a scratch copy, not an implementer step; a reviewer may repeat it on a throwaway copy, never in the working tree). Each one-line production mutation, and which tests go red:

| Mutation | Fails |
| --- | --- |
| `ordering.ts`: `[...project.tasks].sort` becomes `project.tasks.sort` (result-neutral) | only 3e |
| `generateSchedule.ts`: add `task.actualMinutes += chunk` after the `progress.set(...)` line | 3e and 3g, plus many existing tests |
| `generateSchedule.ts`: drop `Math.max(1, …)` around `diasDisponiveis` | only the two 3f rows |
| `capacity.ts`: `(1 - bufferPct)` becomes `0.8` | only 3c (unit and the 0.15 row) |
| `generateSchedule.ts`: `projectedCompletion[project.id] = lastDate ?? today` | only 3a |
| `capacity.ts`: slot lookup drops the weekday test | only 3d (integration and two capacity tests) |
| `ordering.ts`: remaining ignores `actualMinutes` | 3b (plus four existing tests) |
| `capacity.ts`: capacity minus 10 min (under-allocation) | strengthened 3h tests fail; the old `<=` versions pass |
| `generateSchedule.ts`: main loop never runs (empty blocks) | strengthened 3h tests fail; the old versions pass vacuously |

---

## Wave tagging

Per `.claude/rules/08-parallel-subagent-driven-development.md`:

| Task | Files | Depends-on |
| --- | --- | --- |
| 1 | `src/lib/scheduler/config.ts`, `src/lib/scheduler/index.ts`, `tests/lib/scheduler/generateSchedule.test.ts`, `tests/lib/scheduler/gaps.test.ts`, `tests/lib/scheduler/unestimated.test.ts` | none |
| 2 | `tests/lib/scheduler/doneTasks.test.ts`, `src/lib/scheduler/generateSchedule.ts` | 1 |
| 3 | `tests/lib/scheduler/capacity.test.ts`, `tests/lib/scheduler/gaps.test.ts`, `tests/lib/scheduler/generateSchedule.test.ts` | 1, 2 |

**Waves:** `[1]` → `[2]` → `[3]`, fully serial. Tasks 2 and 3 have disjoint `Files`, but Task 3 must verify its numbers against the post-fix `buildResult` and shares test files with Task 1, so no parallel wave exists. Agent routing (CLAUDE.md table): implementers `general-purpose` (no installed specialist covers scheduler or test work), reviewers `code-reviewer`.

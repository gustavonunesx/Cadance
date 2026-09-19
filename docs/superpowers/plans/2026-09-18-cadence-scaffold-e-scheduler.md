# Cadence — Scaffold + Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js 15 project skeleton and implement `src/lib/scheduler/` — the deterministic distribution algorithm — until `generateSchedule.test.ts` and the gap tests from spec §6 all pass.

**Architecture:** A single Next.js 15 App Router app. The scheduler is pure TypeScript with no DB, no network and no AI: it takes a `SchedulerInput` and returns a `SchedulerResult`. It is split into four small modules under `src/lib/scheduler/` (types, capacity/date helpers, task selection, the main loop + result assembly) re-exported from one `index.ts`, which is what tests import as `@/lib/scheduler`.

**Tech Stack:** Next.js 15 (App Router), React, TypeScript (strict), Tailwind CSS, Vitest, ESLint. No Supabase / Anthropic code in this plan — only the env placeholders.

**Spec:** `docs/superpowers/specs/2026-09-16-cadence-pipeline-ia-design.md` (build order §8, steps 0–2), with the algorithm contract in `scheduler-spec.md` and the product context in `PRD_Cadence.md`.

## Scope of this plan

This plan implements **only steps 0, 1 and 2** of the spec's §8 build order:

| # | What | This plan |
| --- | --- | --- |
| 0 | Scaffold: Next.js 15, Tailwind, Vitest, `@` alias | Task 1 |
| 1 | Scheduler driven by the existing tests | Tasks 2–6 |
| 2 | Tests for the §6 gaps | Tasks 7–8 |
| 3+ | Routine profile, `src/lib/md/`, `src/lib/ai/`, screens | **Out of scope** — separate plans |

Spec §7 (doc corrections: `scheduler-spec.md` §11, `PRD_Cadence.md` §4/§8) is **already applied** — commit `c96b8b2 docs: reconciliar PRD, scheduler-spec e testes` did it. Verified: `scheduler-spec.md:316-321` carries the ⚠️ note about the loop continuing to fill the period, the "Geração do cronograma" row of `PRD_Cadence.md` §4 and its critical rule nº 4 both mark peak matching as v2, and `PRD_Cadence.md:281-320` is the estimate-only prompt. **Do not re-apply those edits.**

Spec §4.5 (the `tasks` SQL columns) and §4.6 (DB → scheduler mapping) belong to the Supabase schema, which does not exist yet and lands with build step 3+. This plan carries the *type-level* half of §4 (Tasks 2 and 6) — `needsClarification` on `Task` and `unestimatedTasks` on `SchedulerResult` — because the scheduler must honor them now.

## Global Constraints

- **Golden rule:** the AI estimates, the algorithm distributes. Nothing in `src/lib/scheduler/` may call an AI, a DB or the network. Pure functions: data in, data out.
- **Never mutate the input.** The loop works on a local copy of task progress (`scheduler-spec.md:191`).
- **Strict TypeScript, no `any`.** `strict: true` in `tsconfig.json`, never disabled. Public functions get explicit return types.
- Node **>= 20.9.0** (Next.js 15 floor). Next.js **15.x**, React **19.x**, Vitest **3.x**, TypeScript **5.x**.
- Path alias `@/*` → `src/*`, configured in **both** `tsconfig.json` and `vitest.config.ts`. The test file imports `@/lib/scheduler` (`generateSchedule.test.ts:11`).
- Dependency floor: no library beyond the stack above. The scheduler uses **no date library** — dates are `'YYYY-MM-DD'` strings compared with `<`/`>`/`localeCompare` and advanced with `Date.UTC` arithmetic.
- Default config values: `bufferPct = 0.20`, `minBlockMinutes = 15`, `maxHorizonDays = 365` (`scheduler-spec.md:107-112`).
- Period fill order is always `['manha', 'tarde', 'noite']` — chronological, never reordered (`scheduler-spec.md:199`).
- Peak matching is **v2**: the MVP ignores `isPeak` and `difficulty` in allocation. `preferPeakForHeavy` ships as a signature-only stub (`scheduler-spec.md:263-276`).
- Identifiers in English; user-visible strings in pt-BR (none in this plan — the scheduler returns no copy). Comments may be pt-BR.
- Secrets live in `.env.local` only, which is gitignored. Never commit a real key.
- `npm run test`, `npm run lint` and `npm run typecheck` must all pass before a task counts as done.

---

## File Structure

Created by this plan:

| File | Responsibility |
| --- | --- |
| `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.local.example` | Project scaffold and tooling |
| `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` | Minimal App Router root so `next build` succeeds |
| `src/lib/scheduler/types.ts` | Every scheduler type. No logic. |
| `src/lib/scheduler/capacity.ts` | Date arithmetic + effective capacity (buffer math) |
| `src/lib/scheduler/ordering.ts` | Project urgency ranking + "ready task" selection |
| `src/lib/scheduler/generateSchedule.ts` | The allocation loop + result assembly (feasibility, projected completion) |
| `src/lib/scheduler/preferPeakForHeavy.ts` | v2 stub — signature only |
| `src/lib/scheduler/index.ts` | Public surface: re-exports `generateSchedule`, the stub and all types |
| `tests/lib/scheduler/generateSchedule.test.ts` | The existing suite, moved from repo root |
| `tests/lib/scheduler/gaps.test.ts` | The four §6 gap tests |

Why split: `generateSchedule.ts` alone would hold date math, ranking and the loop — three unrelated reasons to change. Capacity and ordering are each independently testable and are what the gap tests in Task 7 poke at directly.

---

## Task 1: Scaffold the Next.js 15 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.env.local.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Modify: `.gitignore`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the `@/*` → `src/*` alias, and the five npm scripts `dev` / `build` / `test` / `lint` / `typecheck` that every later task runs.

**Context:** The repo currently holds only docs and the `.claude/` harness — no `package.json`, no `src/`. Everything here is new. The existing `.gitignore` contains only aia-harness entries; it must gain the Node/Next entries without losing them.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cadence",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20.9.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^15.5.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.3.1",
    "@tailwindcss/postcss": "^4.1.0",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "eslint": "^9.30.0",
    "eslint-config-next": "^15.5.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.8.0",
    "vite-tsconfig-paths": "^5.1.4",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` populated, `package-lock.json` created, exit 0.

If a listed version no longer resolves, install the current major instead (`npm install next@15 react@19 react-dom@19`) and keep the majors pinned as written. Do not downgrade a major to make a version resolve.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `next.config.ts`**

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

- [ ] **Step 5: Create `postcss.config.mjs`**

```javascript
const config = {
  plugins: ['@tailwindcss/postcss'],
};

export default config;
```

- [ ] **Step 6: Create `eslint.config.mjs`**

```javascript
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
];

export default eslintConfig;
```

- [ ] **Step 7: Create `vitest.config.ts`**

The `@` alias must work in tests, or `generateSchedule.test.ts:11` cannot resolve its import. `vite-tsconfig-paths` reads the alias straight from `tsconfig.json`, so it can never drift from the compiler's view.

```typescript
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 8: Create `src/app/globals.css`**

Colors come from `PRD_Cadence.md` §"Paleta de cores". Only the tokens are defined here — no components yet.

```css
@import "tailwindcss";

:root {
  --background: #0c0d12;
  --card: #15161d;
  --primary: #4f46e5;
  --text: #f5f5f5;
  --text-muted: #9ca3af;
}

body {
  background: var(--background);
  color: var(--text);
}
```

- [ ] **Step 9: Create `src/app/layout.tsx`**

```typescript
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cadence',
  description: 'Seu cronograma diário realista',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Create `src/app/page.tsx`**

Placeholder only — the real "Hoje" screen is build step 7.

```typescript
export default function Home() {
  return <main>Cadence</main>;
}
```

- [ ] **Step 11: Update `.gitignore`**

Append to the existing file — do not replace it; the aia-harness lines at the top must survive.

```gitignore

# node / next
node_modules/
.next/
out/
build/
next-env.d.ts
*.tsbuildinfo

# env
.env
.env*.local

# vitest
coverage/
```

- [ ] **Step 12: Create `.env.local.example`**

This file is committed as documentation; the real `.env.local` is gitignored and never committed.

```bash
# Supabase (build step 3+)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Claude API (build step 5) — server-side only
ANTHROPIC_API_KEY=
```

- [ ] **Step 13: Write a smoke test proving the runner and the alias work**

Create `tests/smoke.test.ts`. This exists only to prove Vitest resolves `@/*`; delete it in Task 2 once the real suite imports the alias.

```typescript
import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 14: Run the three gates**

Run: `npm run test`
Expected: PASS, 1 test.

Run: `npm run typecheck`
Expected: exit 0, no output. (`next-env.d.ts` is generated by `next build` or `next dev`; if `typecheck` complains it is missing, run `npm run build` once first.)

Run: `npm run lint`
Expected: exit 0, no errors.

Run: `npm run build`
Expected: "Compiled successfully", exit 0.

- [ ] **Step 15: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs vitest.config.ts .gitignore .env.local.example src tests
git commit -m "chore: scaffold Next.js 15 + Tailwind + Vitest com alias @"
```

---

## Task 2: Scheduler types and the moved test suite (RED)

**Files:**
- Create: `src/lib/scheduler/types.ts`
- Create: `src/lib/scheduler/index.ts`
- Move: `generateSchedule.test.ts` → `tests/lib/scheduler/generateSchedule.test.ts`
- Delete: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: the `@/*` alias and the npm scripts from Task 1.
- Produces: every type the rest of the plan uses —
  `Period`, `Priority`, `Difficulty`, `Task`, `Project`, `AvailabilitySlot`, `SchedulerConfig`, `ScheduleBlock`, `InfeasibleProject`, `SchedulerResult`, `SchedulerInput` — all exported from both `@/lib/scheduler/types` and `@/lib/scheduler`.

**Context:** This task deliberately ends RED. It puts the real test suite in place and declares the contract; Tasks 3–6 make it green. The types are copied verbatim from `scheduler-spec.md` §2 with the two additions from the pipeline spec §4.1 and §4.2.

- [ ] **Step 1: Move the test file into the tests tree**

The file already carries the correct header comment (`generateSchedule.test.ts:1-8`) naming this destination. Content is unchanged — only its path moves.

```bash
mkdir -p tests/lib/scheduler
git mv generateSchedule.test.ts tests/lib/scheduler/generateSchedule.test.ts
rm tests/smoke.test.ts
```

- [ ] **Step 2: Create `src/lib/scheduler/types.ts`**

`needsClarification` is optional on purpose: the `task()` helper at `tests/lib/scheduler/generateSchedule.test.ts:49-65` never passes it and must keep compiling (pipeline spec §4.1).

```typescript
export type Period = 'manha' | 'tarde' | 'noite';
export type Priority = 'alta' | 'media' | 'baixa';
export type Difficulty = 'leve' | 'media' | 'pesada';

export interface Task {
  id: string;
  projectId: string;
  /** Ordem dentro do projeto — as tarefas são estritamente sequenciais. */
  orderIndex: number;
  estimatedMinutes: number;
  /** Já executado; 0 no primeiro plano. */
  actualMinutes: number;
  /** Usado só na v2 (peak matching). */
  difficulty: Difficulty;
  /** = (status === 'concluida') no banco. */
  done: boolean;
  /** A IA não conseguiu estimar: não gera bloco (default false). */
  needsClarification?: boolean;
}

export interface Project {
  id: string;
  /** 'YYYY-MM-DD' ou null. */
  deadline: string | null;
  priority: Priority;
  /** Desempate estável. */
  createdAt: string;
  tasks: Task[];
}

export interface AvailabilitySlot {
  /** 0=domingo ... 6=sábado. */
  weekday: number;
  period: Period;
  /** Horas livres brutas naquele período/dia. */
  hours: number;
  isPeak: boolean;
}

export interface SchedulerConfig {
  /** Folga de segurança (padrão 0.20). */
  bufferPct: number;
  /** Menor pedaço agendável (padrão 15). */
  minBlockMinutes: number;
  /** Teto para projetos sem prazo (padrão 365). */
  maxHorizonDays: number;
}

export interface ScheduleBlock {
  taskId: string;
  /** 'YYYY-MM-DD'. */
  date: string;
  period: Period;
  minutes: number;
}

export interface InfeasibleProject {
  projectId: string;
  /** Quanto não coube antes do prazo. */
  deficitMinutes: number;
  options: {
    /** Nova data em que o projeto fecharia. */
    esticarPrazoAte: string;
    adicionarMinutosPorDia: number;
    /** = deficitMinutes. */
    cortarEscopoMinutos: number;
  };
}

export interface SchedulerResult {
  feasible: boolean;
  /** Sempre preenchido — o melhor plano possível, mesmo inviável. */
  blocks: ScheduleBlock[];
  /** Vazio quando feasible. */
  infeasibleProjects: InfeasibleProject[];
  /** projectId -> data do último bloco daquele projeto. */
  projectedCompletion: Record<string, string>;
  /** taskIds com needsClarification: ficaram fora do plano. */
  unestimatedTasks: string[];
}

export interface SchedulerInput {
  /** 'YYYY-MM-DD'. */
  today: string;
  projects: Project[];
  availability: AvailabilitySlot[];
  config: SchedulerConfig;
}
```

- [ ] **Step 3: Create `src/lib/scheduler/index.ts` with the types only**

`generateSchedule` does not exist yet — that is what makes the next step fail for the right reason.

```typescript
export type {
  Period,
  Priority,
  Difficulty,
  Task,
  Project,
  AvailabilitySlot,
  SchedulerConfig,
  ScheduleBlock,
  InfeasibleProject,
  SchedulerResult,
  SchedulerInput,
} from './types';
```

- [ ] **Step 4: Run the suite to verify it fails for the right reason**

Run: `npm run test`
Expected: FAIL. Every test errors with a resolution/import failure on `generateSchedule` — something like `No "generateSchedule" export is defined on the "@/lib/scheduler" module`. The *types* must resolve cleanly; if the failure mentions a missing type instead, `types.ts` is wrong — fix it before moving on.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduler/types.ts src/lib/scheduler/index.ts tests/lib/scheduler/generateSchedule.test.ts
git add -u
git commit -m "test: mover suíte do scheduler e declarar os tipos do contrato"
```

---

## Task 3: Date helpers and effective capacity

**Files:**
- Create: `src/lib/scheduler/capacity.ts`
- Test: `tests/lib/scheduler/capacity.test.ts`

**Interfaces:**
- Consumes: `Period`, `AvailabilitySlot`, `SchedulerConfig` from `./types` (Task 2).
- Produces:
  - `PERIODS: readonly Period[]` — `['manha', 'tarde', 'noite']`, the fixed fill order.
  - `weekdayOf(date: string): number` — 0=Sunday.
  - `addDays(date: string, days: number): string`
  - `daysBetween(from: string, to: string): number` — signed whole days, `to - from`.
  - `effectiveCapacity(date: string, period: Period, availability: AvailabilitySlot[], bufferPct: number): number`

**Context:** Dates are `'YYYY-MM-DD'` strings everywhere. Parsing them with `new Date('2026-08-19')` gives UTC midnight, but `new Date(2026, 7, 19)` gives *local* midnight — mixing the two produces off-by-one days in negative timezones. Everything here uses `Date.UTC` so the result never depends on the machine's timezone. No date library.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/scheduler/capacity.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  PERIODS,
  weekdayOf,
  addDays,
  daysBetween,
  effectiveCapacity,
} from '@/lib/scheduler/capacity';
import type { AvailabilitySlot } from '@/lib/scheduler/types';

const availability: AvailabilitySlot[] = [];
for (let weekday = 0; weekday < 7; weekday++) {
  availability.push({ weekday, period: 'manha', hours: 1, isPeak: false });
  availability.push({ weekday, period: 'tarde', hours: 2, isPeak: false });
  availability.push({ weekday, period: 'noite', hours: 3, isPeak: false });
}

describe('PERIODS', () => {
  it('é a ordem cronológica fixa manha, tarde, noite', () => {
    expect(PERIODS).toEqual(['manha', 'tarde', 'noite']);
  });
});

describe('weekdayOf', () => {
  it('2026-08-19 é uma quarta-feira (3)', () => {
    expect(weekdayOf('2026-08-19')).toBe(3);
  });

  it('2026-08-23 é um domingo (0)', () => {
    expect(weekdayOf('2026-08-23')).toBe(0);
  });
});

describe('addDays', () => {
  it('avança um dia', () => {
    expect(addDays('2026-08-19', 1)).toBe('2026-08-20');
  });

  it('atravessa a virada de mês', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('atravessa a virada de ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('soma o horizonte inteiro sem deriva', () => {
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
  });
});

describe('daysBetween', () => {
  it('conta dias inteiros para frente', () => {
    expect(daysBetween('2026-08-19', '2026-08-21')).toBe(2);
  });

  it('é zero no mesmo dia', () => {
    expect(daysBetween('2026-08-19', '2026-08-19')).toBe(0);
  });

  it('é negativo quando a data final já passou', () => {
    expect(daysBetween('2026-08-19', '2026-08-10')).toBe(-9);
  });
});

describe('effectiveCapacity', () => {
  it('aplica o buffer de 20% (2h de tarde => 96 min)', () => {
    expect(effectiveCapacity('2026-08-19', 'tarde', availability, 0.2)).toBe(96);
  });

  it('calcula manhã e noite do exemplo do spec (48 e 144)', () => {
    expect(effectiveCapacity('2026-08-19', 'manha', availability, 0.2)).toBe(48);
    expect(effectiveCapacity('2026-08-19', 'noite', availability, 0.2)).toBe(144);
  });

  it('arredonda para baixo (0.5h com buffer 20% => 24 min, não 24.0)', () => {
    const meiaHora: AvailabilitySlot[] = [
      { weekday: 3, period: 'manha', hours: 0.55, isPeak: false },
    ];
    // 0.55 * 60 * 0.8 = 26.4 -> 26
    expect(effectiveCapacity('2026-08-19', 'manha', meiaHora, 0.2)).toBe(26);
  });

  it('devolve 0 quando não há slot para aquele dia/período', () => {
    expect(effectiveCapacity('2026-08-19', 'noite', [], 0.2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/scheduler/capacity.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/scheduler/capacity"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/scheduler/capacity.ts`:

```typescript
import type { AvailabilitySlot, Period } from './types';

/** Ordem cronológica de preenchimento — nunca reordenar (scheduler-spec §5). */
export const PERIODS: readonly Period[] = ['manha', 'tarde', 'noite'];

const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' -> timestamp UTC. Nunca usa o fuso da máquina. */
function toUtc(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtc(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** 0=domingo ... 6=sábado. */
export function weekdayOf(date: string): number {
  return new Date(toUtc(date)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * MS_PER_DAY);
}

/** Dias inteiros de `from` até `to`; negativo se `to` já passou. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / MS_PER_DAY);
}

/**
 * Capacidade usável de um período num dia, já com a folga de segurança
 * descontada. É aqui que o buffer vive: o resto do algoritmo só preenche
 * capacidade, então nenhum período jamais passa de 100% (scheduler-spec §4.1).
 */
export function effectiveCapacity(
  date: string,
  period: Period,
  availability: AvailabilitySlot[],
  bufferPct: number,
): number {
  const weekday = weekdayOf(date);
  const slot = availability.find((s) => s.weekday === weekday && s.period === period);
  if (!slot) return 0;
  return Math.floor(slot.hours * 60 * (1 - bufferPct));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/scheduler/capacity.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduler/capacity.ts tests/lib/scheduler/capacity.test.ts
git commit -m "feat: helpers de data e capacidade efetiva com buffer"
```

---

## Task 4: Project ranking and ready-task selection

**Files:**
- Create: `src/lib/scheduler/ordering.ts`
- Test: `tests/lib/scheduler/ordering.test.ts`

**Interfaces:**
- Consumes: `Project`, `Task`, `Priority` from `./types` (Task 2).
- Produces:
  - `type TaskProgress = Map<string, number>` — taskId → minutes already allocated **in this run**, on top of `actualMinutes`. This is the local copy that keeps the input immutable.
  - `remainingMinutes(task: Task, progress: TaskProgress): number`
  - `isEligible(task: Task, progress: TaskProgress): boolean`
  - `rankProjects(projects: Project[]): Project[]` — returns a new array, most urgent first.
  - `nextReadyTask(projects: Project[], progress: TaskProgress): Task | null`

**Context:** Two rules combine here. §4.3: within a project the tasks are strictly sequential by `orderIndex` — at most one task per project is "ready" at a time, and a task only becomes ready once every earlier task in its project is fully allocated. §4.4: the five-level project ordering. Both are pure functions over the input plus the progress map.

One subtlety the tests depend on: a *blocked* project must not fall through to its later tasks. If task A1 is still unfinished, the project offers A1 and nothing else — it never offers A2 (`tests/lib/scheduler/generateSchedule.test.ts:177-197`). But a task that is `done`, exhausted, or `needsClarification` is **skipped**, not blocking — the project moves on to the next `orderIndex`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/scheduler/ordering.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  remainingMinutes,
  isEligible,
  rankProjects,
  nextReadyTask,
  type TaskProgress,
} from '@/lib/scheduler/ordering';
import type { Project, Task } from '@/lib/scheduler/types';

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

function project(
  id: string,
  deadline: string | null,
  priority: Project['priority'],
  tasks: Task[],
  createdAt = '2026-01-01',
): Project {
  return { id, deadline, priority, createdAt, tasks };
}

const noProgress: TaskProgress = new Map();

describe('remainingMinutes', () => {
  it('desconta actualMinutes', () => {
    expect(remainingMinutes(task('T', 'P', 0, 100, { actualMinutes: 30 }), noProgress)).toBe(70);
  });

  it('desconta também o que já foi alocado nesta rodada', () => {
    const progress: TaskProgress = new Map([['T', 40]]);
    expect(remainingMinutes(task('T', 'P', 0, 100), progress)).toBe(60);
  });

  it('nunca é negativo', () => {
    expect(remainingMinutes(task('T', 'P', 0, 100, { actualMinutes: 150 }), noProgress)).toBe(0);
  });
});

describe('isEligible', () => {
  it('tarefa concluída não é elegível', () => {
    expect(isEligible(task('T', 'P', 0, 100, { done: true }), noProgress)).toBe(false);
  });

  it('tarefa sem restante não é elegível', () => {
    expect(isEligible(task('T', 'P', 0, 100, { actualMinutes: 100 }), noProgress)).toBe(false);
  });

  it('tarefa sem estimativa da IA não é elegível', () => {
    expect(isEligible(task('T', 'P', 0, 100, { needsClarification: true }), noProgress)).toBe(false);
  });

  it('tarefa pendente com restante é elegível', () => {
    expect(isEligible(task('T', 'P', 0, 100), noProgress)).toBe(true);
  });
});

describe('rankProjects', () => {
  it('com prazo vem antes de sem prazo', () => {
    const ranked = rankProjects([
      project('SEM', null, 'alta', []),
      project('COM', '2026-09-30', 'baixa', []),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['COM', 'SEM']);
  });

  it('prazo mais próximo primeiro, mesmo com prioridade menor', () => {
    const ranked = rankProjects([
      project('LONGE', '2026-09-30', 'alta', []),
      project('PERTO', '2026-08-25', 'baixa', []),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['PERTO', 'LONGE']);
  });

  it('mesmo prazo: prioridade desempata (alta < media < baixa)', () => {
    const ranked = rankProjects([
      project('B', '2026-08-25', 'baixa', []),
      project('M', '2026-08-25', 'media', []),
      project('A', '2026-08-25', 'alta', []),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['A', 'M', 'B']);
  });

  it('mesmo prazo e prioridade: createdAt mais antigo desempata', () => {
    const ranked = rankProjects([
      project('NOVO', '2026-08-25', 'media', [], '2026-05-01'),
      project('VELHO', '2026-08-25', 'media', [], '2026-02-01'),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['VELHO', 'NOVO']);
  });

  it('empate final: id alfabético, para determinismo total', () => {
    const ranked = rankProjects([
      project('Z', '2026-08-25', 'media', [], '2026-02-01'),
      project('A', '2026-08-25', 'media', [], '2026-02-01'),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['A', 'Z']);
  });

  it('não muta o array recebido', () => {
    const input = [
      project('SEM', null, 'alta', []),
      project('COM', '2026-09-30', 'baixa', []),
    ];
    rankProjects(input);
    expect(input.map((p) => p.id)).toEqual(['SEM', 'COM']);
  });

  it('ordena os projetos sem prazo entre si por prioridade', () => {
    const ranked = rankProjects([
      project('B', null, 'baixa', []),
      project('A', null, 'alta', []),
    ]);
    expect(ranked.map((p) => p.id)).toEqual(['A', 'B']);
  });
});

describe('nextReadyTask', () => {
  it('devolve a tarefa de menor orderIndex ainda não concluída', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180),
        task('A2', 'P', 1, 120),
      ]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('A1');
  });

  it('não pula para A2 enquanto A1 não está 100% alocada', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180),
        task('A2', 'P', 1, 120),
      ]),
    ];
    const progress: TaskProgress = new Map([['A1', 179]]);
    expect(nextReadyTask(projects, progress)?.id).toBe('A1');
  });

  it('libera A2 quando A1 está totalmente alocada', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180),
        task('A2', 'P', 1, 120),
      ]),
    ];
    const progress: TaskProgress = new Map([['A1', 180]]);
    expect(nextReadyTask(projects, progress)?.id).toBe('A2');
  });

  it('pula tarefa concluída sem bloquear o projeto', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180, { actualMinutes: 180, done: true }),
        task('A2', 'P', 1, 120),
      ]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('A2');
  });

  it('pula tarefa sem estimativa sem bloquear o projeto', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A1', 'P', 0, 180, { needsClarification: true }),
        task('A2', 'P', 1, 120),
      ]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('A2');
  });

  it('atravessa projetos na ordem de urgência', () => {
    const projects = [
      project('LONGE', '2026-09-30', 'alta', [task('L', 'LONGE', 0, 48)]),
      project('PERTO', '2026-08-25', 'baixa', [task('P', 'PERTO', 0, 48)]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('P');
  });

  it('cai para o próximo projeto quando o mais urgente acabou', () => {
    const projects = [
      project('LONGE', '2026-09-30', 'alta', [task('L', 'LONGE', 0, 48)]),
      project('PERTO', '2026-08-25', 'baixa', [task('P', 'PERTO', 0, 48)]),
    ];
    const progress: TaskProgress = new Map([['P', 48]]);
    expect(nextReadyTask(projects, progress)?.id).toBe('L');
  });

  it('devolve null quando não há nada pronto', () => {
    expect(nextReadyTask([], noProgress)).toBeNull();
  });

  it('respeita orderIndex mesmo se o array de tarefas vier fora de ordem', () => {
    const projects = [
      project('P', '2026-08-25', 'alta', [
        task('A2', 'P', 1, 120),
        task('A1', 'P', 0, 180),
      ]),
    ];
    expect(nextReadyTask(projects, noProgress)?.id).toBe('A1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/scheduler/ordering.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/scheduler/ordering"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/scheduler/ordering.ts`:

```typescript
import type { Priority, Project, Task } from './types';

/** taskId -> minutos alocados nesta rodada, além de actualMinutes. */
export type TaskProgress = Map<string, number>;

const PRIORITY_RANK: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };

/** Quanto ainda falta da tarefa, contando o que já foi alocado neste plano. */
export function remainingMinutes(task: Task, progress: TaskProgress): number {
  const allocated = task.actualMinutes + (progress.get(task.id) ?? 0);
  return Math.max(0, task.estimatedMinutes - allocated);
}

/**
 * Tarefa pode gerar bloco? `done`, restante 0 e `needsClarification` são as
 * três portas de saída (scheduler-spec §4.2 + pipeline spec §4.3).
 */
export function isEligible(task: Task, progress: TaskProgress): boolean {
  if (task.done) return false;
  if (task.needsClarification) return false;
  return remainingMinutes(task, progress) > 0;
}

/** Projetos por urgência, menor = mais urgente (scheduler-spec §4.4). */
export function rankProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    // 1. Com prazo antes de sem prazo.
    if (a.deadline !== null && b.deadline === null) return -1;
    if (a.deadline === null && b.deadline !== null) return 1;
    // 2. Entre os com prazo: earliest-deadline-first.
    if (a.deadline !== null && b.deadline !== null && a.deadline !== b.deadline) {
      return a.deadline < b.deadline ? -1 : 1;
    }
    // 3. Prioridade.
    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    // 4. createdAt mais antigo.
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    // 5. id, para determinismo total.
    return a.id.localeCompare(b.id);
  });
}

/**
 * A tarefa pronta do projeto mais urgente que tem alguma.
 *
 * Dentro do projeto as tarefas são estritamente sequenciais: a primeira
 * elegível por `orderIndex` bloqueia as seguintes até ser 100% alocada.
 * Tarefas inelegíveis (concluídas, exauridas, sem estimativa) são puladas —
 * elas não travam o projeto (scheduler-spec §4.3).
 */
export function nextReadyTask(projects: Project[], progress: TaskProgress): Task | null {
  for (const project of rankProjects(projects)) {
    const ordered = [...project.tasks].sort((a, b) => a.orderIndex - b.orderIndex);
    const ready = ordered.find((task) => isEligible(task, progress));
    if (ready) return ready;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/lib/scheduler/ordering.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduler/ordering.ts tests/lib/scheduler/ordering.test.ts
git commit -m "feat: ranking de urgência e seleção da tarefa pronta"
```

---

## Task 5: The allocation loop and result assembly (GREEN)

**Files:**
- Create: `src/lib/scheduler/generateSchedule.ts`
- Modify: `src/lib/scheduler/index.ts`
- Test: `tests/lib/scheduler/generateSchedule.test.ts` (already in place, unchanged)

**Interfaces:**
- Consumes: everything from Tasks 2–4 — `PERIODS`, `addDays`, `daysBetween`, `effectiveCapacity`, `remainingMinutes`, `isEligible`, `nextReadyTask`, `TaskProgress`, and all types.
- Produces: `generateSchedule(input: SchedulerInput): SchedulerResult`, exported from `@/lib/scheduler`. This is the whole public API of the module.

**Context:** This is the task that turns the suite green. Four details decide it, and each maps to a specific assertion:

1. **The loop does not stop when a task finishes.** `while (cap > 0)` calls `nextReadyTask` again and keeps filling the same period. This is what puts B1 into D2's leftover 36 morning minutes (`scheduler-spec.md:310-321`, asserted at `tests/lib/scheduler/generateSchedule.test.ts:344-345`).
2. **The anti-sliver guard.** A chunk smaller than `minBlockMinutes` is refused *unless* it completes the task. Refusing breaks out of the period, leaving the rest as extra slack (`tests/lib/scheduler/generateSchedule.test.ts:273-296` and `298-309`).
3. **Deadlines never stop the loop.** It allocates everything up to `maxHorizonDays`; the deadline is only a checkpoint applied afterwards. That is why Example B still allocates all 400 minutes of C1 (`tests/lib/scheduler/generateSchedule.test.ts:395-397`).
4. **Deficit = minutes after the deadline + minutes never allocated.** Example B's 112 comes from the first half; the "no availability at all" case's 60 and the past-deadline case's 100 come from both halves (`tests/lib/scheduler/generateSchedule.test.ts:451-480`).

On the infeasible options, note what `esticarPrazoAte` does when a project has *no* blocks at all (zero availability): there is no last block to name. Fall back to the project's own deadline — the deficit and `cortarEscopoMinutos` still carry the real information, and the tests only assert the deficit in that scenario (`tests/lib/scheduler/generateSchedule.test.ts:464`).

- [ ] **Step 1: Run the moved suite to confirm it is still RED**

Run: `npx vitest run tests/lib/scheduler/generateSchedule.test.ts`
Expected: FAIL — no `generateSchedule` export. This is the test written in Task 2; do not modify it.

- [ ] **Step 2: Write the implementation**

Create `src/lib/scheduler/generateSchedule.ts`:

```typescript
import { PERIODS, addDays, daysBetween, effectiveCapacity } from './capacity';
import {
  nextReadyTask,
  remainingMinutes,
  type TaskProgress,
} from './ordering';
import type {
  InfeasibleProject,
  Project,
  ScheduleBlock,
  SchedulerInput,
  SchedulerResult,
} from './types';

/**
 * Distribui as tarefas dos projetos nos dias disponíveis.
 *
 * Função pura: não fala com banco nem com IA, e não muta a entrada — o
 * progresso da alocação vive num Map local (scheduler-spec §1 e §5).
 */
export function generateSchedule(input: SchedulerInput): SchedulerResult {
  const { today, projects, availability, config } = input;
  const blocks: ScheduleBlock[] = [];
  const progress: TaskProgress = new Map();

  const horizon = addDays(today, config.maxHorizonDays);
  let date = today;

  while (date <= horizon && nextReadyTask(projects, progress) !== null) {
    for (const period of PERIODS) {
      let cap = effectiveCapacity(date, period, availability, config.bufferPct);

      while (cap > 0) {
        const task = nextReadyTask(projects, progress);
        if (task === null) break;

        const remaining = remainingMinutes(task, progress);
        const chunk = Math.min(remaining, cap);

        // Guarda anti-sliver: nada menor que minBlock, a não ser que conclua
        // a tarefa. O resto do período vira folga extra.
        if (chunk < config.minBlockMinutes && chunk < remaining) break;

        blocks.push({ taskId: task.id, date, period, minutes: chunk });
        progress.set(task.id, (progress.get(task.id) ?? 0) + chunk);
        cap -= chunk;
      }
    }
    date = addDays(date, 1);
  }

  return buildResult(blocks, progress, input);
}

function buildResult(
  blocks: ScheduleBlock[],
  progress: TaskProgress,
  input: SchedulerInput,
): SchedulerResult {
  const { today, projects } = input;

  const unestimatedTasks = projects.flatMap((project) =>
    project.tasks
      .filter((task) => task.needsClarification && !task.done)
      .map((task) => task.id),
  );

  const projectedCompletion: Record<string, string> = {};
  const infeasibleProjects: InfeasibleProject[] = [];

  for (const project of projects) {
    const taskIds = new Set(project.tasks.map((task) => task.id));
    const projectBlocks = blocks.filter((block) => taskIds.has(block.taskId));

    const lastDate = lastBlockDate(projectBlocks);
    if (lastDate !== null) projectedCompletion[project.id] = lastDate;

    if (project.deadline === null) continue;

    const afterDeadline = projectBlocks
      .filter((block) => block.date > project.deadline!)
      .reduce((sum, block) => sum + block.minutes, 0);

    // O que nem chegou a ser alocado (horizonte estourado, sem disponibilidade)
    // também é deficit.
    const neverAllocated = project.tasks.reduce(
      (sum, task) => sum + remainingMinutes(task, progress),
      0,
    );

    const deficitMinutes = afterDeadline + neverAllocated;
    if (deficitMinutes <= 0) continue;

    // Sem nenhum bloco não há "última data" real — o prazo original é o que
    // resta de informação honesta.
    const esticarPrazoAte = lastDate ?? project.deadline;
    const diasDisponiveis = Math.max(1, daysBetween(today, project.deadline) + 1);

    infeasibleProjects.push({
      projectId: project.id,
      deficitMinutes,
      options: {
        esticarPrazoAte,
        adicionarMinutosPorDia: Math.ceil(deficitMinutes / diasDisponiveis),
        cortarEscopoMinutos: deficitMinutes,
      },
    });
  }

  return {
    feasible: infeasibleProjects.length === 0,
    blocks,
    infeasibleProjects,
    projectedCompletion,
    unestimatedTasks,
  };
}

function lastBlockDate(blocks: ScheduleBlock[]): string | null {
  if (blocks.length === 0) return null;
  return blocks.reduce((latest, block) => (block.date > latest ? block.date : latest), blocks[0].date);
}

/** Projetos sem prazo nunca são inviáveis (scheduler-spec §7). */
export type { Project };
```

Remove that trailing `export type { Project }` line if ESLint flags it as redundant — it is there only to keep the import used; if `Project` ends up unused in the final code, delete the import instead.

- [ ] **Step 3: Export `generateSchedule` from the barrel**

Replace the contents of `src/lib/scheduler/index.ts`:

```typescript
export { generateSchedule } from './generateSchedule';

export type {
  Period,
  Priority,
  Difficulty,
  Task,
  Project,
  AvailabilitySlot,
  SchedulerConfig,
  ScheduleBlock,
  InfeasibleProject,
  SchedulerResult,
  SchedulerInput,
} from './types';
```

- [ ] **Step 4: Run the suite to verify it passes**

Run: `npx vitest run tests/lib/scheduler/generateSchedule.test.ts`
Expected: PASS, all 18 tests.

If "Exemplo A" fails on the exact blocks, check detail 1 above — the inner `while (cap > 0)` must re-enter `nextReadyTask` after a task completes, not `break`.
If "Exemplo B" reports a deficit other than 112, check that the loop is not stopping at the deadline.

- [ ] **Step 5: Run the full gates**

Run: `npm run test`
Expected: PASS — the scheduler suite plus the capacity and ordering suites.

Run: `npm run typecheck`
Expected: exit 0.

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scheduler/generateSchedule.ts src/lib/scheduler/index.ts
git commit -m "feat: laço de alocação e montagem do resultado do scheduler"
```

---

## Task 6: `needsClarification` handling and the v2 peak stub

**Files:**
- Create: `src/lib/scheduler/preferPeakForHeavy.ts`
- Modify: `src/lib/scheduler/index.ts`
- Test: `tests/lib/scheduler/unestimated.test.ts`

**Interfaces:**
- Consumes: `generateSchedule` (Task 5), `ScheduleBlock` from `./types`.
- Produces: `preferPeakForHeavy(blocks: ScheduleBlock[]): ScheduleBlock[]`, exported from `@/lib/scheduler`.

**Context:** Task 5's `isEligible` already excludes flagged tasks, and `buildResult` already fills `unestimatedTasks` — this task proves both with tests and adds the v2 stub the spec asks for. The stub is **signature only**: `scheduler-spec.md:273-276` says "deixar a assinatura pronta, sem implementar". Returning the input unchanged is the honest identity implementation; do not write the swap logic.

The key behavioral assertion: a flagged task is excluded from the deficit too. Its minutes are not counted as a shortfall, because there is no trustworthy estimate to count — inventing one would break the golden rule as badly as ignoring it (pipeline spec §4.4).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/scheduler/unestimated.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateSchedule, preferPeakForHeavy } from '@/lib/scheduler';
import type {
  AvailabilitySlot,
  Project,
  ScheduleBlock,
  SchedulerConfig,
  Task,
} from '@/lib/scheduler';

const DEFAULT_CONFIG: SchedulerConfig = {
  bufferPct: 0.2,
  minBlockMinutes: 15,
  maxHorizonDays: 365,
};

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
  opts: { needsClarification?: boolean } = {},
): Task {
  return {
    id,
    projectId,
    orderIndex,
    estimatedMinutes,
    actualMinutes: 0,
    difficulty: 'media',
    done: false,
    needsClarification: opts.needsClarification,
  };
}

function project(id: string, deadline: string | null, tasks: Task[]): Project {
  return { id, deadline, priority: 'media', createdAt: '2026-01-01', tasks };
}

describe('tarefas sem estimativa (needsClarification)', () => {
  it('não gera bloco e entra em unestimatedTasks', () => {
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', null, [
          task('OK', 'P', 0, 60),
          task('FLAG', 'P', 1, 60, { needsClarification: true }),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_CONFIG,
    });

    expect(result.blocks.some((b) => b.taskId === 'FLAG')).toBe(false);
    expect(result.unestimatedTasks).toEqual(['FLAG']);
  });

  it('não bloqueia as tarefas seguintes do mesmo projeto', () => {
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', null, [
          task('FLAG', 'P', 0, 60, { needsClarification: true }),
          task('DEPOIS', 'P', 1, 60),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_CONFIG,
    });

    const total = result.blocks
      .filter((b) => b.taskId === 'DEPOIS')
      .reduce((sum, b) => sum + b.minutes, 0);
    expect(total).toBe(60);
  });

  it('não entra no cálculo de deficit — o plano continua viável', () => {
    // 60 min cabem folgados até o prazo; os 999 flagueados são ignorados.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [
        project('P', '2026-08-25', [
          task('OK', 'P', 0, 60),
          task('FLAG', 'P', 1, 999, { needsClarification: true }),
        ]),
      ],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_CONFIG,
    });

    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toHaveLength(0);
    expect(result.unestimatedTasks).toEqual(['FLAG']);
  });

  it('unestimatedTasks é vazio quando nenhuma tarefa está flagueada', () => {
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', null, [task('OK', 'P', 0, 60)])],
      availability: availabilityEveryDay(1, 2, 3),
      config: DEFAULT_CONFIG,
    });
    expect(result.unestimatedTasks).toEqual([]);
  });
});

describe('preferPeakForHeavy (stub v2)', () => {
  it('existe e devolve os blocos sem alterar (peak matching é v2)', () => {
    const blocks: ScheduleBlock[] = [
      { taskId: 'T', date: '2026-08-19', period: 'manha', minutes: 48 },
    ];
    expect(preferPeakForHeavy(blocks)).toEqual(blocks);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/scheduler/unestimated.test.ts`
Expected: FAIL — `preferPeakForHeavy is not a function`. The four `needsClarification` tests should already PASS, because Task 5 implemented that behavior; if any of them fails, fix `ordering.ts` / `generateSchedule.ts` before adding the stub.

- [ ] **Step 3: Write the stub**

Create `src/lib/scheduler/preferPeakForHeavy.ts`:

```typescript
import type { ScheduleBlock } from './types';

/**
 * v2 — troca de período tarefas `pesada` com tarefas `leve` do mesmo dia,
 * quando isso não muda o dia de nenhuma tarefa.
 *
 * Adiado de propósito (scheduler-spec §9): peak matching compete com o
 * earliest-deadline-first e, mal feito, empurra tarefa urgente para depois,
 * furando prazo. A assinatura fica pronta; o MVP devolve o plano intacto.
 */
export function preferPeakForHeavy(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return blocks;
}
```

- [ ] **Step 4: Export it from the barrel**

Add to `src/lib/scheduler/index.ts`, right under the `generateSchedule` export:

```typescript
export { preferPeakForHeavy } from './preferPeakForHeavy';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/lib/scheduler/unestimated.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scheduler/preferPeakForHeavy.ts src/lib/scheduler/index.ts tests/lib/scheduler/unestimated.test.ts
git commit -m "feat: stub preferPeakForHeavy e testes de tarefa sem estimativa"
```

---

## Task 7: Gap tests — spec §6

**Files:**
- Create: `tests/lib/scheduler/gaps.test.ts`

**Interfaces:**
- Consumes: `generateSchedule` and the types from `@/lib/scheduler` (Tasks 2–6). Adds no production code.
- Produces: nothing consumed by later tasks.

**Context:** The pipeline spec §6 names four things the existing checklist claims to cover but does not. Three are behavioral; the fourth (`preferPeakForHeavy` exists) was already covered in Task 6, so it is not repeated here.

1. **`scheduler-spec.md` §10.7** — a deadline that fits with exactly zero slack beyond the buffer must come back feasible. Setup: only mornings available (48 min/day effective), a 96-minute task, deadline on D2. It fills D1 morning (48) and D2 morning (48), landing exactly on the deadline.
2. **`ceil()` in `adicionarMinutosPorDia`** — the existing Example B uses 112÷1, which has no remainder and so cannot tell `ceil` from `floor`. This needs a deficit that does not divide evenly across the available days.
3. **`maxHorizonDays`** — never exercised. A small horizon must stop the loop, leaving work unallocated; for a project with a deadline that unallocated work must surface as deficit.

For test 2, the arithmetic: mornings only (48/day), today D1 = `2026-08-19`, deadline D3 = `2026-08-21`, one task of 200 minutes. The loop allocates 48 on D1, D2, D3, D4 (192) and the final 8 on D5 — 8 < 15 but it completes the task, so the anti-sliver guard allows it. Minutes after the deadline: D4's 48 + D5's 8 = **56**. `diasDisponiveis` = `daysBetween(D1, D3) + 1` = **3**. `56 / 3 = 18.67` → `ceil` gives **19**, `floor` would give 18. Verify this arithmetic against the real implementation output before asserting; if the loop behaves differently, correct the expected numbers rather than the implementation, and say so in the commit.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/scheduler/gaps.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateSchedule } from '@/lib/scheduler';
import type {
  AvailabilitySlot,
  Project,
  SchedulerConfig,
  Task,
} from '@/lib/scheduler';

const DEFAULT_CONFIG: SchedulerConfig = {
  bufferPct: 0.2,
  minBlockMinutes: 15,
  maxHorizonDays: 365,
};

function availabilityEveryDay(manha: number, tarde: number, noite: number): AvailabilitySlot[] {
  const slots: AvailabilitySlot[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    slots.push({ weekday, period: 'manha', hours: manha, isPeak: false });
    slots.push({ weekday, period: 'tarde', hours: tarde, isPeak: false });
    slots.push({ weekday, period: 'noite', hours: noite, isPeak: false });
  }
  return slots;
}

function task(id: string, projectId: string, estimatedMinutes: number): Task {
  return {
    id,
    projectId,
    orderIndex: 0,
    estimatedMinutes,
    actualMinutes: 0,
    difficulty: 'media',
    done: false,
  };
}

function project(id: string, deadline: string | null, tasks: Task[]): Project {
  return { id, deadline, priority: 'alta', createdAt: '2026-01-01', tasks };
}

// ---------------------------------------------------------------------------
// §10.7 — prazo exatamente no limite
// ---------------------------------------------------------------------------

describe('§10.7 — prazo exatamente no limite', () => {
  it('é viável quando o trabalho fecha no último dia do prazo, sem folga', () => {
    // Só manhã: 48 min/dia. 96 min = exatamente D1 + D2. Prazo em D2.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', '2026-08-20', [task('T', 'P', 96)])],
      availability: availabilityEveryDay(1, 0, 0),
      config: DEFAULT_CONFIG,
    });

    expect(result.feasible).toBe(true);
    expect(result.infeasibleProjects).toHaveLength(0);
    expect(result.projectedCompletion['P']).toBe('2026-08-20');
    // Nenhum bloco depois do prazo.
    for (const block of result.blocks) {
      expect(block.date <= '2026-08-20').toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ceil() em adicionarMinutosPorDia
// ---------------------------------------------------------------------------

describe('adicionarMinutosPorDia arredonda para cima', () => {
  it('usa ceil quando o deficit não divide igual pelos dias disponíveis', () => {
    // Só manhã (48/dia), 200 min, prazo em D3.
    // Aloca 48 em D1..D4 (192) + 8 em D5 (conclui, passa no anti-sliver).
    // Depois do prazo: 48 (D4) + 8 (D5) = 56. diasDisponiveis = 3.
    // 56/3 = 18.67 -> ceil = 19 (floor daria 18).
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', '2026-08-21', [task('T', 'P', 200)])],
      availability: availabilityEveryDay(1, 0, 0),
      config: DEFAULT_CONFIG,
    });

    expect(result.feasible).toBe(false);
    const infeasible = result.infeasibleProjects[0];
    expect(infeasible.deficitMinutes).toBe(56);
    expect(infeasible.options.adicionarMinutosPorDia).toBe(19);
  });
});

// ---------------------------------------------------------------------------
// maxHorizonDays
// ---------------------------------------------------------------------------

describe('maxHorizonDays', () => {
  it('para o laço no horizonte e não agenda além dele', () => {
    // Horizonte de 2 dias, tarefa gigante: nada pode cair depois de D3.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', null, [task('T', 'P', 100000)])],
      availability: availabilityEveryDay(1, 2, 3),
      config: { ...DEFAULT_CONFIG, maxHorizonDays: 2 },
    });

    expect(result.blocks.length).toBeGreaterThan(0);
    for (const block of result.blocks) {
      expect(block.date <= '2026-08-21').toBe(true);
    }
  });

  it('o que não coube no horizonte vira deficit num projeto com prazo', () => {
    // Horizonte 0 => só D1 (288 min de capacidade). Tarefa de 500.
    const result = generateSchedule({
      today: '2026-08-19',
      projects: [project('P', '2026-12-31', [task('T', 'P', 500)])],
      availability: availabilityEveryDay(1, 2, 3),
      config: { ...DEFAULT_CONFIG, maxHorizonDays: 0 },
    });

    const allocated = result.blocks.reduce((sum, b) => sum + b.minutes, 0);
    expect(allocated).toBe(288);
    expect(result.feasible).toBe(false);
    expect(result.infeasibleProjects[0].deficitMinutes).toBe(212);
  });
});
```

- [ ] **Step 2: Run it and read every failure carefully**

Run: `npx vitest run tests/lib/scheduler/gaps.test.ts`
Expected: some of these may already pass — they exercise existing behavior that was simply never tested. That is a fine outcome; the point of the task is the coverage, not a red bar.

For any that fail, decide which side is wrong before editing anything:
- If the implementation contradicts `scheduler-spec.md`, fix the implementation.
- If the expected arithmetic in the test is off (my hand-computed 56 / 19 / 212 above), fix the test and note the corrected arithmetic in the commit message.

Do **not** change `tests/lib/scheduler/generateSchedule.test.ts` — it is the reference suite and must stay green throughout.

- [ ] **Step 3: Make any needed fix and re-run**

Run: `npm run test`
Expected: PASS, every suite — including the untouched `generateSchedule.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/scheduler/gaps.test.ts
git add -u
git commit -m "test: cobrir lacunas do spec §6 (prazo no limite, ceil, maxHorizonDays)"
```

---

## Task 8: Full gate run and branch verification

**Files:**
- Modify: none expected. Fix whatever the gates report.

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: a branch where `test`, `lint`, `typecheck` and `build` all pass.

**Context:** Project rule: every compilation, syntax or lint error found during the session gets fixed, whether or not this plan introduced it. Do not label anything "pre-existing, not related".

- [ ] **Step 1: Run the test suite**

Run: `npm run test`
Expected: PASS. Suites: `capacity`, `ordering`, `generateSchedule`, `unestimated`, `gaps`.

- [ ] **Step 2: Run the typechecker**

Run: `npm run typecheck`
Expected: exit 0, no output.

- [ ] **Step 3: Run the linter**

Run: `npm run lint`
Expected: exit 0, no errors and no warnings.

- [ ] **Step 4: Run the production build**

Run: `npm run build`
Expected: "Compiled successfully", exit 0.

- [ ] **Step 5: Confirm nothing untracked or unintended is left**

Run: `git status --short`
Expected: clean, or only files you deliberately left untracked. `node_modules/`, `.next/` and `.env.local` must **not** appear — if they do, `.gitignore` from Task 1 Step 11 is wrong.

Run: `git log --oneline c96b8b2..HEAD`
Expected: the seven commits from Tasks 1–7, in order.

- [ ] **Step 6: Commit any fixes**

Only if Steps 1–5 required changes:

```bash
git add -A
git commit -m "fix: corrigir erros apontados pelos gates de qualidade"
```

---

## Wave tagging (for parallel execution)

Per `.claude/rules/08-parallel-subagent-driven-development.md`:

| Task | Files | Depends-on |
| --- | --- | --- |
| 1 | `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`, `.env.local.example`, `src/app/**`, `tests/smoke.test.ts` | none |
| 2 | `src/lib/scheduler/types.ts`, `src/lib/scheduler/index.ts`, `tests/lib/scheduler/generateSchedule.test.ts`, `tests/smoke.test.ts` | 1 |
| 3 | `src/lib/scheduler/capacity.ts`, `tests/lib/scheduler/capacity.test.ts` | 2 |
| 4 | `src/lib/scheduler/ordering.ts`, `tests/lib/scheduler/ordering.test.ts` | 2 |
| 5 | `src/lib/scheduler/generateSchedule.ts`, `src/lib/scheduler/index.ts` | 3, 4 |
| 6 | `src/lib/scheduler/preferPeakForHeavy.ts`, `src/lib/scheduler/index.ts`, `tests/lib/scheduler/unestimated.test.ts` | 5 |
| 7 | `tests/lib/scheduler/gaps.test.ts` | 6 |
| 8 | (verification only) | 7 |

**Waves:** `[1]` → `[2]` → `[3, 4]` (disjoint files, neither depends on the other — the one real parallel wave) → `[5]` → `[6]` → `[7]` → `[8]`.

Tasks 5 and 6 both touch `src/lib/scheduler/index.ts`, so they can never share a wave.

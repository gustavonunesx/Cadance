---
paths: ["src/lib/scheduler/**", "src/lib/ai/**", "tests/**/scheduler/**"]
---

# Scheduler — the golden rule and its invariants

## The golden rule

**The AI estimates. The algorithm distributes. Never invert it.**

- `src/lib/ai/` reads the project `.md`, splits it into tasks, and estimates
  `estimated_minutes` per task. That is its entire job.
- `src/lib/scheduler/` spreads those minutes across days. Deterministic code
  only — never a prompt, never a model call.

Why: language models get arithmetic wrong. A schedule that allocates more hours
than the user actually has destroys trust in the whole product. Arithmetic is
the code's responsibility, and the code is covered by tests.

If the easiest path starts looking like "ask the AI to build the schedule",
that is the rule being violated. Extract with the AI, distribute with the
algorithm.

## Invariants

Every one of these is pure logic and must have a test.

1. **Never over-allocate.** No day/period is ever assigned more hours than it
   has available.
2. **Safety margin.** Never fill 100% of available time — reserve the
   configurable margin (default 15–20%).
3. **Feasibility check.** Before returning a schedule, compare required hours
   against hours available until the deadline. If it does not fit, return an
   explicit *infeasible* result carrying the three ways out — stretch the
   deadline, add hours, or cut scope — instead of an unrealistic plan.
4. **Replanning looks forward only.** Rebalancing redistributes from today
   onward; past days are never rewritten.
5. **Heavy tasks in the peak block** when the user has marked a period as peak.

## Shape

- Pure functions: data in, data out. No DB access, no AI calls, no I/O inside
  the scheduler.
- Strict TypeScript — inputs and outputs fully typed, no `any`.
- Write the tests first. State the case in plain terms ("4h available, 3 tasks →
  no day exceeds 4h"), then make it pass.

## Tests that must exist

- Allocation never exceeds availability, per day and per period.
- The safety margin holds at the boundary (a day that would land exactly at
  100% without it).
- An impossible deadline returns the infeasible result, not a plan.
- Replanning mid-project leaves past days untouched.
- A peak-marked period receives the heaviest task.

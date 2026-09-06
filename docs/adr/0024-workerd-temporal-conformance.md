# ADR 0024: Split deterministic and native temporal conformance

Status: accepted for M4, 2026-09-05.

The workerd Vitest integration exposes `runDurableObjectAlarm()`, eviction, and
storage inspection, but it does not expose a controllable runtime clock or a
way to disable wall-clock alarm delivery. Vitest fake timers do not control the
runtime. A shared scenario that advances an injected engine clock while the
same Durable Object alarm follows wall time therefore has two unsynchronised
owners.

`hostConformance()` now covers clock-independent Host behavior on every
adapter. `temporalHostConformance()` keeps exact deadlines, timer ordering,
retry times, retention, and ping deadlines on the memory Host in ordinary and
hibernating modes, where one manual clock owns both time and alarm dispatch.
Workerd uses `Date.now()` and separately proves native alarm persistence,
delivery after eviction, ordered user timers, retry without a retained user
timer, hello deadlines, and retention after a real timer crosses the boundary.

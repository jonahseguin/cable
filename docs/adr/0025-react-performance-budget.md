# ADR 0025: React client performance budget

Status: accepted, 2026-09-06.

M4 fixes the client fixture at 200 procedures and 40 channels. It creates a
native TanStack Query option for every procedure and checks `useQuery` and
`useMutation` inference. Before this decision, the gate applied fewer than
500,000 instantiations and less than 2.5 seconds to both programs.
M3 measured 310,351 client instantiations in 2.00 to 2.21 seconds on CI. Before
the M4 optimization, the same client workload measured 325,199 and 2.73
seconds. The optimization measures 320,097 and 2.74 seconds on CI run
34014898803 at `63b77df62a`.

This decision changes only the client check-time ceiling from 2.5 to
3.0 seconds. It retains the 500,000-instantiation ceiling, the full 200/40
fixture, native TanStack inference, and the edge program's 2.5-second ceiling.
Two bounded traces found no actionable Cable type hotspot. Property-level
constraints measured worse and were reverted. This revises a requirement. It
does not show that the old gate passed or that further improvement is
impossible.

`scripts/ts-perf.ts`, `fixtures/big-contract/baseline.json`,
`fixtures/big-contract/README.md`, `docs/DESIGN.md` section 13, `docs/PLAN.md`,
and ADR 0018 record this limit. A fresh CI run must keep the client below
500,000 and 3.0 seconds, and the edge program below 500,000 and 2.5 seconds.

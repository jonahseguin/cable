# 0018: Type performance measures consumer inference

Status: accepted, 2026-09-05.

The generated type performance project enables TypeScript's `skipLibCheck`. The
root and package typechecks keep it disabled and remain authoritative for cable's
declarations and their dependencies. The performance gate measures a consumer
constructing the full generated contract and using every typed client node without
rechecking the implementation of DOM, Zod, and other dependency declarations.

The benchmark runs TypeScript 5.9.3 on Node 24.16.0 in CI, matching the runtime
recorded in `baseline.json`. A separate Node 22.18.0 job builds, typechecks, checks
boundaries, and runs the tests on the minimum supported Node release. On the same
local fixture and compiler invocation, Node 22 took 0.50–0.52 seconds while Node 24
took 0.39–0.42 seconds. Keeping runtime compatibility separate prevents JavaScript
engine speed from changing the meaning of the compiler performance baseline.

On the M1 fixture, declaration checking accounted for 146,422 instantiations and
0.42 seconds on the local reference machine: 413,536 instantiations and 0.94 seconds
with it, compared with 267,114 instantiations and 0.52 seconds without it. The
fixture retains all 200 procedures and 40 channels, and the limits remain fewer
than 500,000 instantiations and 2.5 seconds of uncompensated compiler check time.
The M2 fixture adds real client handles for all 40 channels, including every event
listener, client event, host procedure, and presence view. M4 adds TanStack Query
options for all 200 procedures and native `useQuery` and `useMutation` inference.
That workload records 325,195 instantiations and 0.62 seconds on the same reference
machine.

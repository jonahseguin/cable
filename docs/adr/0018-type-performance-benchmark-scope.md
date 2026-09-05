# 0018: Type performance measures consumer inference

Status: accepted, 2026-09-05.

The generated type performance project enables TypeScript's `skipLibCheck`. The
root and package typechecks keep it disabled and remain authoritative for cable's
declarations and their dependencies. The performance gate measures a consumer
constructing the full generated contract and using every typed client node without
rechecking the implementation of DOM, Zod, and other dependency declarations.

On the M1 fixture, declaration checking accounted for 146,422 instantiations and
0.42 seconds on the local reference machine: 413,536 instantiations and 0.94 seconds
with it, compared with 267,114 instantiations and 0.52 seconds without it. The
fixture retains all 200 procedures and 40 channels, and the limits remain fewer
than 500,000 instantiations and 2.5 seconds of uncompensated compiler check time.

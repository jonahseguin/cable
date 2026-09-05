# Contract performance fixture

M0 fixes the workload in `workload.json` with `pnpm generate:perf`. It does not
measure cable's type performance yet: the contract and client APIs do not exist.
`pnpm ts-perf` reports this explicitly. `pnpm ts-perf --require-baseline` fails
until a real fixture is activated.

At M1, extend the generator to render this workload through the actual exported
contract DSL and typed client. Include input/output/error inference and exercise
every procedure, channel event, host procedure, and presence operation. Preserve
200 global procedures nested three levels deep and 40 channels, each with four
server events, three client events, two procedures, and presence.

Add a fixture tsconfig and its schema dependency, record runner/compiler/version
and measured baseline in `baseline.json`, set `status` to `active`, and require
`--require-baseline` in CI. The runner uses a fresh, nonincremental `tsc` process
and fails on compiler errors or missing diagnostics. Passing requires fewer than
500,000 instantiations and less than 2.5 seconds check time. Do not replace the
real client fixture with structural type aliases or relax the budget to make a
regression pass.

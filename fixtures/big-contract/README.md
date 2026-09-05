# Contract performance fixture

Run `bun run generate:perf` to regenerate the fixed workload. The generated
contract contains 200 procedures nested three levels deep and 40 channels. Each
channel declares four server events, three client events, two host procedures,
and presence. `client.ts` calls every global procedure through the real typed
client and evaluates input, output, and error inference for every node. It also
opens all 40 typed channel handles and exercises each event listener, client
event, host procedure, and presence view.

`bun run ts-perf --require-baseline` starts fresh TypeScript processes. One checks
the client program's file list and rejects the fixture's backend module or package
implementation source. The other reports compiler diagnostics and enforces fewer
than 500,000 instantiations and less than 2.5 seconds of check time. The M2
measurement is recorded in `baseline.json`; the fixed limits remain the CI gate.
The fixture skips rechecking dependency declaration bodies so the measurement
covers cable's consumer-facing inference. Root and package typechecks continue to
check those declarations.

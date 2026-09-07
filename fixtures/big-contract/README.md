# Contract performance fixture

Run `bun run generate:perf` to regenerate the fixed workload. The generated
contract contains 200 procedures nested three levels deep and 40 channels. Each
channel declares four server events, three client events, two host procedures,
and presence. `client.ts` calls every global procedure through the real typed
client, creates native TanStack Query options for every procedure, and evaluates
input, output, and error inference for every node. It also
opens all 40 typed channel handles and exercises each event listener, client
event, host procedure, and presence view.

`edge.ts` is a separate server-side type program. It imports the public
`EdgeHosts` type from `@cablejs/core` and exercises all 40 channel leaves: four
server-event `emit` calls and both host-procedure `call` methods per channel.
It stays out of the client program so the client boundary check remains valid.

`bun run ts-perf --require-baseline` starts fresh TypeScript processes. One checks
the client program's file list and rejects the fixture's backend module or package
implementation source. It then compiles the client and edge programs separately.
Each program must remain below 500,000 instantiations. The client program must
check in less than 3.0 seconds; the edge program must check in less than 2.5
seconds. `baseline.json` records the M4 client measurement and both CI limits.
The fixture skips rechecking dependency declaration bodies so the measurement
covers cable's consumer-facing inference. Root and package typechecks continue to
check those declarations.

# Gotchas

## Signal tags

Internally, it is more efficient to order signal tags in a manner of most unique to least unique:

- Given a workflow with tags:
	- namespace = foo
	- type = normal

The signal should be published with `namespace = foo` first, then `type = normal`

## Durable loops: never a raw `loop`/`for` around `ctx.activity`

Use a gasoline durable loop primitive (`ctx.loope`, `ctx.lupe`, or `ctx.repeat` in `ctx/workflow.rs`) for any loop that calls `ctx.activity` / `ctx.signal` / other durable steps. Only these primitives move completed iterations into *forgotten* event history (see `WORKFLOW_HISTORY.md`); a raw Rust `loop {}` or `while` keeps every iteration in **live** history forever.

Consequences of a raw loop around durable steps: workflow history grows unbounded, every wake replays the entire accumulated history, and eventually the history range read exceeds the FDB 5s transaction window so `wf history` / `wf get` fail with `transaction too old` and the workflow drags. This is especially dangerous for resume-cursor / retry loops (e.g. a throttled bulk activity that re-dispatches until a cursor clears) because the iteration count is unbounded and data-dependent.

A raw `for` over a **known-small, statically-bounded** collection is tolerable. If the collection size is unbounded, data-dependent, or driven by a resume cursor / retry, it must be a durable primitive.

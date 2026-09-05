# conformance

Shared behavioral test suite for every Host adapter.

`hostConformance(factory)` registers the same engine scenarios in ordinary mode
and with engine reconstruction between every step. The factory supplies an
isolated real Host, an adapter-level connection seam, manual time, and optional
hibernation. The suite covers grant rejection, handshake and replay, event and
presence validation, durable timers, peer calls, byte limits, and stale socket
cleanup.

The package exports `conformanceChannel` and
`createConformanceImplementation()` so each adapter runs the same contract and
application behavior. Adapters translate their real socket and upgrade APIs to
`HostConformanceDriver`; the suite does not substitute a mock engine.

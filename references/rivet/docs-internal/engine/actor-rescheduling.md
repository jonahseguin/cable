# Actor Rescheduling

This document describes every situation that causes an actor to be migrated off a host (an envoy or legacy runner) and onto another one, the configuration that controls each path, and where each path does or does not have a thundering-herd mitigation today.

The goal is for actor migration to always be gradual: a graceful drain of any single host or version must never produce a coordinated burst of allocations elsewhere. Today the engine partially achieves this, but there are a few gaps worth being explicit about (see [Thundering-herd gaps](#thundering-herd-gaps) at the bottom).

Throughout this document "envoy" means the actor-hosting process on the user side, and "engine" means the Rivet control plane. New work targets the actor v2 / envoy v2 path ([`pegboard-envoy`](file:///home/nathan/rivet-ee/engine/packages/pegboard-envoy/) plus the [`actor2` workflow](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/actor2/mod.rs)); the legacy runner v1 path is mentioned only where it differs.

## Configuration surfaces

There are three places that influence rescheduling behavior. None of them are user-facing on the actor itself: they live on the runner pool (the engine record that describes how a named pool of envoys is provisioned) and on the engine's static config.

### Per-pool runner config

Defined in [`engine/packages/types/src/runner_configs.rs`](file:///home/nathan/rivet-ee/engine/packages/types/src/runner_configs.rs) as `RunnerConfigKind::Normal` and `RunnerConfigKind::Serverless`. These fields are stored alongside the pool and apply to every envoy / runner in that pool.

| Field | Default | Applies to | What it does |
| --- | --- | --- | --- |
| `drain_on_version_upgrade` | `false` | both | When the engine sees a new envoy/runner version come online, automatically drain everything still on an older version. See [Version-upgrade migration](#version-upgrade-migration). |
| `actor_eviction_delay` (seconds) | `0` | both | After an envoy reports `ToRivetStopping`, wait this long before starting to migrate its actors. Gives the user's autoscaler time to bring new envoys online before existing ones start handing off. |
| `actor_eviction_period` (seconds) | `0` | both | Upper bound on the wall-clock duration of an envoy's actor-eviction phase, in seconds. Acts as a ceiling on the per-actor interval (`period / num_actors`). |
| `actor_eviction_rate` (actors/sec) | `1.0` | both | Floor on per-actor eviction spacing (`1.0 / rate` seconds between actors). The effective spacing is `min(1.0/rate, period/num_actors)`. See [SIGTERM drain (envoy `Stopping`)](#sigterm-drain-envoy-stopping). |
| `request_lifespan` (seconds) | n/a | serverless | How long a single serverless HTTP request stays open before the engine deliberately drains it and opens a new one. |
| `drain_grace_period` (seconds) | n/a | serverless | Per-envoy time budget for finishing in-flight work after the engine asks it to drain. Validated to never exceed `actor_stop_threshold`. |
| `max_concurrent_actors` | n/a | serverless | Cap on the number of actors that can be allocated to the pool. Allocation simply fails over the cap; this is not a rescheduling input. |

Note that the user-facing names you may have seen elsewhere (`eviction_threshold`, `eviction_rate`, `eviction_duration`) are not the canonical names. The actual field names are `actor_eviction_delay`, `actor_eviction_rate`, `actor_eviction_period`.

### Engine config (`pegboard.*`)

Defined in [`engine/packages/config/src/config/pegboard.rs`](file:///home/nathan/rivet-ee/engine/packages/config/src/config/pegboard.rs). These are global, set by whoever runs the engine, not by the namespace owner.

| Field | Default | Used for |
| --- | --- | --- |
| `envoy_lost_threshold` | `15_000` ms | If the engine has not received a ping from an envoy for this long, the engine treats the envoy as gone and starts marking its actors as `Lost`. |
| `envoy_update_ping_interval` | `3_000` ms | How often each envoy pings the engine. |
| `envoy_eligible_threshold` | `10_000` ms | An envoy is only eligible for new actor allocations if its last ping is within this window. |
| `actor_start_threshold` | `30_000` ms | Per-actor budget for the envoy to acknowledge an allocation/start. If exceeded the actor is marked `Lost` with `LostReason::EnvoyNoResponse`. |
| `actor_stop_threshold` | `1_800_000` ms (30 min) | Per-actor budget for the envoy to acknowledge a stop / going-away. If exceeded the actor is marked `Lost`. |
| `serverless_drain_grace_period` | (engine default) | How long an in-flight serverless HTTP request is allowed to keep running after the engine asks it to drain. |

### Envoy / runner side

The envoy decides on its own when to send `ToRivetStopping`. In practice that happens when the host receives `SIGTERM`, when a serverless request approaches `request_lifespan`, or when the envoy is told via `ToEnvoyConnClose` by the engine.

The envoy does not have any user-tunable knobs that change how it staggers actor migration: all staggering happens engine-side in the [`evict_actors`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/ops/envoy/evict_actors.rs) operation using the per-pool eviction fields above.

## Rescheduling paths

There are exactly three reasons an actor gets moved off its current host:

1. The host runs an older version of the user's code and `drain_on_version_upgrade` is on.
2. The host tells the engine it is shutting down (`ToRivetStopping`), typically because of `SIGTERM` or a serverless `request_lifespan` deadline.
3. The host stops responding (ping timeout, or a per-actor event timeout).

Anything else — manual destroy, sleep, alarms — is not "rescheduling," it is normal lifecycle and is out of scope here.

### 1. Version-upgrade migration

```diagram
╭───────────────────╮      ╭───────────────────────╮      ╭────────────────────────────╮
│ Metadata poller   │─────▶│ envoy::drain (or      │─────▶│ For serverless: send       │
│ sees newer        │      │ runner::drain) op     │      │ ToEnvoyConnClose to every  │
│ runner_version /  │      │ checks                │      │ older envoy in parallel.   │
│ envoy_version     │      │ drain_on_version_     │      │ For serverful runner v1:   │
│ in /metadata      │      │ upgrade flag          │      │ send Stop signal to every  │
╰───────────────────╯      ╰───────────────────────╯      │ older runner workflow.     │
                                                          ╰────────────────────────────╯
```

The trigger is the per-pool [metadata poller](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/runner_pool_metadata_poller.rs). It periodically fetches a serverless pool's `/metadata` endpoint; if `runner_version` / `envoy_version` in the response is higher than what some currently-registered host reports, the poller calls:

- [`pegboard_runner_drain_older_versions`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/ops/runner/drain.rs) for the legacy runner v1 path. With `drain_on_version_upgrade = true` it scans `RunnerAllocIdxKey`, finds every runner workflow whose `version` is below the new one, and sends `runner2::Stop { reset_actor_rescheduling: false }` to each. The receiving runner workflow then runs its own draining state machine, which signals every actor it owns with `actor::GoingAway` (see [`runner2.rs` handle_stopping](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/runner2.rs#L218-L268)).
- [`pegboard_envoy_drain_older_versions`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/ops/envoy/drain.rs) for the envoy v2 path. With `drain_on_version_upgrade = true` it scans `EnvoyLoadBalancerIdxKey`, finds every envoy whose `version` is below the new one, and publishes a `ToEnvoyConnClose` to each. The envoy reacts by responding with `ToRivetStopping`, which is then handled by the SIGTERM-drain path below.

If `drain_on_version_upgrade` is `false`, neither op does anything. The engine simply lets the old version keep running until something else takes it down:

- For serverless, the natural lifecycle is `request_lifespan`. The connection workflow ([`serverless/conn.rs`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/serverless/conn.rs#L448-L489)) sleeps until `request_lifespan - serverless_drain_grace_period`, then drains. So upgrades roll out organically as requests cycle.
- For serverful, the engine waits until the operator restarts the host, which produces a `SIGTERM` on the runner, which produces a `ToRivetStopping` back to the engine.

### 2. SIGTERM drain (envoy `Stopping`)

This is the path you get from a Kubernetes pod terminating, an AWS Spot interruption, an autoscaler scale-in, or the version-upgrade path above feeding into `ToEnvoyConnClose`. The envoy receives `SIGTERM` from the host OS, finishes whatever immediate cleanup it needs to, and sends `protocol::ToRivet::ToRivetStopping` over its tunnel websocket.

The handler is in [`ws_to_tunnel_task.rs::handle_to_rivet`](file:///home/nathan/rivet-ee/engine/packages/pegboard-envoy/src/ws_to_tunnel_task.rs#L738-L777):

```diagram
╭────────────────╮  ToRivetStopping   ╭─────────────────────╮   spawn   ╭───────────────────────╮
│ envoy gets     │ ─────────────────▶ │ ws_to_tunnel_task   │ ────────▶ │ sleep delay           │
│ SIGTERM        │                    │ removes envoy from  │           │ then evict_actors op  │
│                │                    │ load balancer       │           │ with throttle         │
╰────────────────╯                    ╰─────────────────────╯           ╰─────────┬─────────────╯
                                                                                  │
                                                                                  ▼
                                                                  ╭─────────────────────────────╮
                                                                  │ For each actor on envoy,    │
                                                                  │ send actor2::GoingAway      │
                                                                  │ spaced by max(1.0/rate,     │
                                                                  │ period/num_actors)          │
                                                                  ╰─────────────────────────────╯
```

The three eviction knobs from the pool config are layered like this:

1. **`actor_eviction_delay`** — `tokio::sleep(actor_eviction_delay)` before doing anything. This is the explicit "let the new pods boot first" window.
2. **`actor_eviction_rate`** — sets the per-actor pacing floor to `1.0 / rate` seconds.
3. **`actor_eviction_period`** — sets a ceiling on total eviction time. The per-actor interval becomes `min(1.0/rate, period/num_actors)`, so a tight `period` will speed evictions up beyond what `rate` alone would allow.

For each actor, the op sends `actor2::GoingAway { generation }`. The receiving actor workflow ([`actor2/mod.rs`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/actor2/mod.rs#L952-L1010)) transitions to `GoingAway`, asks the envoy to stop it, waits up to `actor_stop_threshold` for the envoy to confirm, then reschedules itself via `runtime::reschedule_actor` (which calls `Allocate` to pick a new envoy and bumps the actor's `generation`).

Removing the envoy from the load balancer happens immediately and unconditionally; the `actor_eviction_delay` only applies to the actor handoff, not to the LB removal. New traffic stops hitting the draining envoy right away.

> **Runner v1 caveat.** [`runner2::handle_stopping`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/runner2.rs#L218-L268) sends `GoingAway` to every actor it owns in a tight `for` loop, with no throttle. The `actor_eviction_*` knobs are an envoy-v2-only feature. Anything still on the legacy runner protocol does an instant-fan-out at SIGTERM time.

### 3. Envoy stops responding (lost)

The actor v2 workflow is responsible for detecting that the envoy currently hosting it has gone away. There are two flavors of "lost", both of which end in [`StoppedVariant::Lost`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/actor2/runtime.rs) which triggers `reschedule_actor`.

**`LostReason::EnvoyNoResponse`** — the actor is in a transitional state (`Allocating`, `Starting`, `SleepIntent`, `StopIntent`, `GoingAway`, `Destroying`) and the envoy did not send any event before the per-transition `lost_timeout_ts`. The timeout is `actor_start_threshold` (default 30s) or `actor_stop_threshold` (default 30 min) depending on the transition. See [`listen_for_signals`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/actor2/mod.rs#L426-L498).

**`LostReason::EnvoyConnectionLost`** — the actor is `Running` and the engine has not received a ping from the actor's envoy in `envoy_lost_threshold` (default 15s). The workflow re-checks envoy liveness via the `CheckEnvoyLiveness` activity, which reads the envoy's last ping timestamp from UDB. If the timestamp is older than `now - envoy_lost_threshold`, the actor is declared lost.

When an actor is marked lost it goes through `handle_stopped` and then `reschedule_actor`. Each actor reschedule independently runs its own exponential backoff via [`RetryBackoffState`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/actor2/runtime.rs#L140-L160) (base ~`min_metadata_poll_interval`, exponent 8, jittered ±500ms, reset after 10 minutes idle). The backoff is per-actor, not coordinated across actors.

## Thundering-herd gaps

The user-stated goal is "we never have a stampede." The engine gets close, but here is an honest accounting of where staggering exists and where it does not. These are things to be aware of when sizing pools and tuning the eviction knobs, not "bugs" per se.

1. **`drain_on_version_upgrade` (serverless) closes all old envoys in parallel.** [`pegboard_envoy_drain_older_versions`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/ops/envoy/drain.rs#L86-L97) loops over `older_envoys` and publishes `ToEnvoyConnClose` to every one of them in a tight loop. Each envoy independently then starts its own `actor_eviction_delay` + throttled eviction, so per-envoy you do get staggering, but the engine is asking every envoy in the pool to start draining at the same wall-clock instant. With a fleet of N envoys, your effective eviction rate during a version cutover is roughly `N * actor_eviction_rate`, not `actor_eviction_rate`. **This is the situation the user flagged. It is real.** If you want fleet-wide staggering for a version cutover, the eviction knobs as currently defined do not give it to you. The mitigation today is to choose `actor_eviction_delay` larger than the time you want between waves and to size your replacement pool to absorb the peak; long-term we should add a fleet-wide pacing layer in `pegboard_envoy_drain_older_versions`.

2. **`drain_on_version_upgrade` (runner v1) signals every old runner in parallel and each runner has no throttle.** [`pegboard_runner_drain_older_versions`](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/ops/runner/drain.rs#L95-L104) sends `runner2::Stop` to every older runner workflow at once, and then each runner v1 fan-outs `GoingAway` to all of its actors immediately ([`runner2.rs` lines 244-265](file:///home/nathan/rivet-ee/engine/packages/pegboard/src/workflows/runner2.rs#L244-L265)). Per CLAUDE.md this is the deprecated path so this is acceptable, but worth knowing.

3. **An envoy crash produces a synchronized `Lost` cohort.** When an envoy stops pinging, every actor it hosted runs the same `listen_n_until` deadline (`last_liveness_check_ts + envoy_lost_threshold`) and they all wake up within roughly the same workflow tick. They all individually call `Allocate` and reschedule. The per-actor exponential backoff via `RetryBackoffState` only kicks in on the second-and-later retry, so the first wave is unthrottled. If you lose a busy envoy you should expect a burst of allocations against the rest of the pool, bounded by allocator throughput rather than by any pacing layer.

4. **Reschedule backoff is per-actor.** `RetryBackoffState` is stored on the individual actor workflow's state. There is no global rate limiter on `Allocate`, so simultaneous reschedules from a lost-envoy cohort all hit the allocator at once.

The first one is the most worth resolving, since it is the case the user explicitly asked about and the case most likely to occur in normal operation (rolling a new version is a routine action). The other three either are by design (deprecated path), are inherent to the crash-handling model (you have to react quickly when an envoy is gone), or are mitigated downstream by the allocator and exponential backoff.

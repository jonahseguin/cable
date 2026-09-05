# Dynamic Configuration

Reconfigure a running cluster without restarting anything. The `dynamic_config` service runs in
every engine process and listens on two broadcast pubsub subjects, so one CLI invocation reaches
every process.

Overrides are in-memory only. A process that restarts goes back to the values baked into its config
file and environment.

## Config properties

`rivet-engine config update` broadcasts a structured change to the config root. Only the properties
with a subcommand can be changed; add a field to `rivet_config::DynamicConfigUpdate` and a branch in
`Config::apply_dynamic` to make one more property configurable.

The result is validated exactly like a config loaded from disk, and a rejected value changes
nothing. The CLI applies the change against its own process first, so a bad value fails at the
terminal instead of in every process's logs.

```bash
# Roll compaction out to 25% of database branches
rivet-engine config update compaction-admission-percent 25

# Squeeze compaction's FoundationDB budgets during an incident
rivet-engine config update compaction-write-bytes-per-second 4194304
rivet-engine config update compaction-read-bytes-per-second 16777216

# Omit the value to revert a property to what the config file says
rivet-engine config update compaction-admission-percent
```

Reading a property dynamically is opt-in. `config.sqlite()` always returns the value loaded at
startup; a call site sees runtime changes only if it reads `config.dynamic().sqlite()`. Take that
snapshot once per decision rather than holding it.

`rivet-engine config show` prints the config as loaded, not the dynamic view.

## Tracing

Log filter directives use the standard `tracing_subscriber::EnvFilter` grammar, the same as
`RUST_LOG`.

```bash
# Crank everything to debug
rivet-engine tracing config --filter debug

# Module-scoped
rivet-engine tracing config --filter 'info,rivet_guard=debug'

# Reset to the baked-in default
rivet-engine tracing config --filter ''

# Sample 10% of traces, then reset to the default
rivet-engine tracing config --sampler-ratio 0.1
rivet-engine tracing config --sampler-ratio ''
```

Always reset the filter when done. Leaving `debug` on costs extra log ingestion and inflates trace
volume if the sampler was raised too.

## Code refs

- CLI: `engine/packages/engine/src/commands/config.rs`, `engine/packages/engine/src/commands/tracing.rs`
- Service: `engine/packages/dynamic-config/src/`
- Config storage: `engine/packages/config/src/lib.rs` (`Config::dynamic`, `Config::apply_dynamic`)
- Reload handle: `engine/packages/runtime/src/traces.rs`

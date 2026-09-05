# 0007: One durable alarm

Status: accepted in the original design.

Store a timer queue and arm the host’s single alarm for the earliest due item. Compaction, presence sweeps, and user timers share it, so adapters do not duplicate scheduling policy.

Source: [DESIGN.md](../DESIGN.md), section 12, decision 7.

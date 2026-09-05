# 0006: Runtime state is authoritative

Status: accepted in the original design.

Reconstruct behavior lazily from sockets, attachments, and storage after hibernation. Memory may cache but cannot own durable state. Do not introduce an eager onWake rebuild; all engine behaviors must pass across a fresh engine instance.

Source: [DESIGN.md](../DESIGN.md), section 12, decision 6.

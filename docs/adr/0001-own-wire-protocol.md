# 0001: Own the wire protocol

Status: accepted in the original design.

Use a versioned JSON protocol for resumable, hibernation-aware channels. Sequence numbers and resume cursors are protocol concerns; adapting an object-capability transport would obscure the core behavior. Cap’n Web remains reference material and a possible later transport.

Source: [DESIGN.md](../DESIGN.md), section 12, decision 1.

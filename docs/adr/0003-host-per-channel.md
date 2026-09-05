# 0003: One host per channel instance

Status: accepted in the original design.

Map each concrete channel instance to one durable host. This provides a single ordering domain and one wake per broadcast. Do not multiplex channel instances inside a v1 host.

Source: [DESIGN.md](../DESIGN.md), section 12, decision 3.

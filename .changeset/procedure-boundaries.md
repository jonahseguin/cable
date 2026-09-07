---
"@cablejs/core": patch
"@cablejs/client": patch
---

Prevent middleware from executing a mutation twice, sanitize malformed GET results, and
reject success envelopes returned with failing HTTP statuses.

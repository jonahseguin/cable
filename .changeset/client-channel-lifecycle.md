---
"@cablejs/client": patch
---

Release pooled channel resources when the last subscription or operation on a
channel view settles. Fire-and-forget events remain leased until their socket
write completes, while cleanup can safely subscribe again on the same handle.

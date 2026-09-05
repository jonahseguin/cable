# 0004: One client, multiple sockets

Status: accepted in the original design.

Present one typed client while managing a socket per subscribed host. Session-host aggregation adds wakes and bookkeeping; application-level aggregate channels may use Peers instead.

Source: [DESIGN.md](../DESIGN.md), section 12, decision 4.

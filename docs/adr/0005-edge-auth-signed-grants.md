# 0005: Authenticate at the edge

Status: accepted in the original design.

Authenticate before routing to a host, then forward a short-lived HMAC-signed grant bound to the host key. The host verifies signature, expiry, and destination before authorization. Credentials never appear in protocol frames.

Source: [DESIGN.md](../DESIGN.md), section 12, decision 5.

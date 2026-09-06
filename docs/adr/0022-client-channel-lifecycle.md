# ADR 0022: Channel view leases

Status: accepted for M4 implementation

## Decision

A channel factory returns a lazy, stable channel view. Creating a view does not
resolve parameters, acquire a pooled channel, or open a socket. A view has a
terminal `dispose()` method. Disposal releases its resources, cannot be undone,
and later operations reject with `UNAVAILABLE`.

Each view counts local leases. Event subscriptions, status subscriptions, and
presence subscriptions hold a lease until their idempotent cleanup runs. The
first local lease acquires one pooled-channel reference for that view. The last
release drops that one reference. Multiple listeners on one view therefore do
not increase the pool reference count. Separate views still hold separate pool
references, even when they share a canonical channel key.

Acknowledged events, host calls, history calls, and presence updates hold a
temporary lease until their promise settles. A fire-and-forget event keeps its
temporary lease until the session writes it to the socket or reports failure.
Adding it to a session queue does not finish the operation. `onError` only
observes errors and does not acquire a lease or start a connection.

Subscription cleanup leaves a non-disposed view reusable. A later subscription
acquires a fresh pooled reference and receives the next welcome snapshot. The
client caches proxy children so reading a channel factory repeatedly returns
the same factory function. React uses subscription cleanup, never terminal
disposal, so Strict Mode remounts and abandoned renders do not create a second
lifecycle path.

## Consequences

The pool idle timeout remains the only delay before a final pooled reference
closes its session. View presence getters retain the last snapshot while idle;
a later subscription replaces it from the next welcome frame. No view may
reuse a pooled reference after terminal disposal.

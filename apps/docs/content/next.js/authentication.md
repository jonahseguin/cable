# Authentication

Sock8 requires users to be authenticated before they can subscribe to channels.

In a Next.js app, you handle authentication using the `withSock8` utility.

---

## How it works

When a client connects to Sock8, it needs a **signed token** that describes which channels it should have access to.

You generate this token server-side by:

1. Authenticating the user inside your Next.js route handler.
2. Defining which channels they should be allowed to subscribe to (even static ones).
3. Calling `conn.identifyAs()` and `conn.grant()`.

Sock8 takes care of signing the token and returning it to the client automatically.

---

> **Note:**  
> All channels — static or parameterized — must be explicitly granted.  
> There are no "public" or "auto-allowed" channels by default.

---

## Basic Example

Here’s a minimal working example:

```typescript
// app/api/channels/[...all]/route.ts
import { withSock8 } from '@sock8/next';
import { channels } from '@/lib/channels'; // your defined server tree
import { auth } from '@/lib/auth'; // your auth logic (e.g., next-auth)

export const POST = withSock8({
  authorize: async (conn) => {
    const session = await auth.api.getSession();

    if (!session) {
      return; // not authenticated
    }

    conn.identifyAs(session.user.id);

    conn.grant(channels.notification.for({ userId: session.user.id }));

    // You can also grant static channels:
    // conn.grant(channels.admin.logs);
  },
});
```

✅ **`identifyAs`** sets the identity tied to the socket connection.  
✅ **`grant`** defines the channels this user is authorized to access.

Sock8 handles the rest.

---

## Notes

- You must explicitly `grant()` **every** channel a user should access — including static (non-parameterized) ones.
- You can grant multiple channels by calling `conn.grant()` multiple times.
- If you return early (without identifying and granting channels), the connection will be rejected.
- You can use any auth provider you want (NextAuth.js, Clerk, custom sessions, etc.).
- This handler typically lives at `/api/channels/route.ts`, but you can customize the route path.

---

## Why is this necessary?

Sock8 enforces strict channel-based access control.

You cannot connect to **any** channel — static or parameterized — unless:

- You are authenticated.
- The server has explicitly authorized access to that channel.

This ensures that channel access is **always secure and intentional** — not open to abuse by clients guessing channel names or forging paths.

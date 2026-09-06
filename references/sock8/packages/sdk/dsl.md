# Internal Docs: Channel Definition DSL

This document describes the internal Domain-Specific Language (DSL) for defining WebSocket channel structures and schemas.

**Core Concept:** Define channels using a configuration object passed to the core channel definition logic (conceptually `channels(config)`). Keys represent channel paths (dot-notation, `{param}` placeholders), and values specify Zod schemas or nested channel structures. A key goal is to provide end-to-end type safety, from definition to access and usage, complementing runtime validation.

## Configuration Object

The primary input is a configuration object:

```typescript
const channelConfig = {
  // Channel definitions go here
  'public-chat': [z.object({ message: z.string(), sender: z.string() })],
  'user.{userId}.notifications': [z.object({ alert: z.string() })],
  // ... more channels
};

// The system processes this config:
const channelTree = channels(channelConfig); // Hypothetical entry point
```

- **Keys (`string`)**: Channel paths.
- **Values (`ChannelSchemaDefinition | StructuredChannelTree`)**: Endpoint definition or a nested tree.

## Channel Path Syntax

- **Dot Notation:** `.` creates nesting (e.g., `'admin.users.list'` -> `channelTree.admin.users.list`).
- **Parameters:** `{paramName}` defines dynamic segments (e.g., `'chat.{chatId}.messages'`). Parameters are runtime strings.

## Basic Usage

This section covers the most common ways to define and access channels.

### Defining Static Endpoints

Endpoints are channels with a defined Zod schema.

1.  **Tuple Format:** `[ZodSchema, optionalConfigObject?]`
    ```typescript
    'global': [z.string()],
    'metrics': [z.number(), { rateLimit: 100 }],
    ```
2.  **Object Format:** `{ schema: ZodSchema, config?: optionalConfigObject }`
    ```typescript
    'tasks': { schema: z.object({ /*...*/ }), config: { notify: true } },
    ```

- **Schema:** Defines message payload structure.
- **Config:** Optional metadata.

### Accessing Static Endpoints

Paths without parameters are directly accessible and type-safe:

```typescript
// Config: { 'admin.users.list': [z.array(z.string())] }
channelTree.admin.users.list.emit(['user1']); // OK
// channelTree.admin.users.list.emit(123); // <-- TypeScript Error!
```

### Defining Simple Parameterized Endpoints

Use `{paramName}` in the path string.

```typescript
const config = {
  'user.{userId}.profile': [z.object({ name: z.string() })],
  'chat.{chatId}.messages': [z.object({ text: z.string() })],
};
```

### Accessing Simple Parameterized Endpoints (`.for()`)

Access parameterized channels via the **type-safe** `.for()` method located on the node representing the **full static path prefix**.

- **`.for(params)`:** Takes an object where keys **exactly match** the parameter names. TypeScript enforces the parameter names and their `string` type.

**Note on Parameter Position:** The exact position of parameter segments (`{paramName}`) within the path string does not change the resulting structure or access method. The `.for()` method is always attached to the node representing the _full static path_ identified before any parameters. Both `'user.{userId}.profile'` and `'user.profile.{userId}'` result in the same access pattern: `channelTree.user.profile.for({ userId: string })`.

```typescript
// Config: { 'user.{userId}.profile': [z.object({ name: z.string() })] }

const userProfile = channelTree.user.profile.for({ userId: 'user-123' }); // OK
// const userProfile = channelTree.user.profile.for({}); // <-- TypeScript Error! (Missing userId)
// const userProfile = channelTree.user.profile.for({ userId: 123 }); // <-- TypeScript Error! (userId must be string)

userProfile.emit({ name: 'Alice' }); // OK
// userProfile.emit({ name: 123 }); // <-- TypeScript Error!
```

**Runtime Errors:** Calls to `.for()` with dynamically generated parameters that are incorrect (missing/extra keys) will throw a runtime error.

```typescript
const dynamicParams: any = { userId: 'u', extra: 'e' };
channelTree.user.profile.for(dynamicParams); // THROWS (Runtime check catches extra key)
```

### Simple Nesting (Under Static Key)

You can nest pre-built channel structures under a **static** key.

```typescript
// 1. Define the nested structure
const adminAuditChannels = channels({
  logs: [z.string()], // Static child
  'events.{eventId}': [
    z.object({
      /*...*/
    }),
  ], // Parameterized child
});

// 2. Nest it under a static key in the main config
const config = {
  public: [z.string()],
  admin: adminAuditChannels, // Nested under static key 'admin'
};
const channelTree = channels(config);

// 3. Accessing nested channels

// Access static child directly:
channelTree.admin.logs.emit('User logged in');

// Access parameterized child via .for() on the parent node:
const adminEvents = channelTree.admin.for({ eventId: 'evt-123' });
adminEvents.emit({
  /*...*/
});
```

## Advanced Usage

This section covers more complex scenarios like parameter consolidation and nesting under parameterized keys.

### Parameter Consolidation

Multiple parameterized definitions sharing the same static prefix node (e.g., `notifications`) are consolidated into a single `.for()` method on that node. The method dispatches based on exact parameter matching.

```typescript
// Config: {
//   'notifications.{userId}': [z.string()],
//   'notifications.{groupId}': [z.number()],
//   'notifications.global': [z.boolean()] // Static sibling remains separate
// }

// Access:
channelTree.notifications.global.emit(true); // Access static sibling

// Access consolidated .for:
const userNotify = channelTree.notifications.for({ userId: 'user-123' }); // -> string schema
const groupNotify = channelTree.notifications.for({ groupId: 'group-456' }); // -> number schema

// Errors:
channelTree.notifications.for({}); // THROWS (Expected {userId} or {groupId})
channelTree.notifications.for({ userId: 'u', groupId: 'g' }); // THROWS (Ambiguous)
```

### Nesting Under Parameterized Keys

You can nest a pre-built tree under a parameterized key. Access involves resolving the parent node first using `.for()`, then accessing the nested content.

```typescript
// 1. Define nested structure
const activityChannels = channels({
  posts: [
    z.object({
      /*...*/
    }),
  ],
  'comments.{postId}': [
    z.object({
      /*...*/
    }),
  ],
});

// 2. Nest under a parameterized key
const config = {
  'user.{userId}.activity': activityChannels,
  'user.{userId}.settings': [
    z.object({
      /*...*/
    }),
  ], // Another endpoint for the same param
};
const channelTree = channels(config);

// 3. Accessing Nested Structures

// Access the parent node ('user.activity') first:
const resolvedActivityNode = channelTree.user.activity.for({ userId: 'user-123' });
// resolvedActivityNode now IS the finalized activityChannels structure for this user.

// Access static child on the resolved node:
resolvedActivityNode.posts.emit({
  /*...*/
});

// Access parameterized child via .for() on the resolved node:
const commentsChannel = resolvedActivityNode.for({ postId: 'post-456' });
commentsChannel.emit({
  /*...*/
});

// Access the sibling endpoint ('user.{userId}.settings'):
const userSettings = channelTree.user.settings.for({ userId: 'user-123' });
userSettings.emit({
  /*...*/
});
```

### Consolidation with Complex Nesting

Parameter definitions from a nested tree's root **are handled by the nested tree's own `.for` method** after the tree is resolved via the parent's `.for` method. Parameter definitions attached directly to the same static prefix node in the parent config are handled by the **parent node's `.for` method**.

```typescript
// Config: {
//   'prefix.{paramId}': channels({         // Nested tree under param
//      '{nestedId}': [z.string()]        // Nested tree's def expects {nestedId}
//   }),
//   'prefix.{otherId}': [z.number()]      // Direct def on prefix expects {otherId}
// }

// Access the DIRECT definition via the PARENT node's .for method:
const directEndpoint = channelTree.prefix.for({ otherId: 'o1' }); // OK -> Returns ChannelMethods

// Resolve the NESTED tree via the PARENT node's .for method:
const resolvedNestedNode = channelTree.prefix.for({ paramId: 'p1' }); // OK -> Returns finalized nested tree

// Access the NESTED definition via the RESOLVED NESTED node's .for method:
const nestedEndpoint = resolvedNestedNode.for({ nestedId: 'n1' }); // OK -> Returns ChannelMethods

// ---- Invalid Calls ----

// Calling the PARENT node ('channelTree.prefix.for'):
channelTree.prefix.for({}); // THROWS (Expected {paramId} or {otherId})
channelTree.prefix.for({ paramId: 'p', otherId: 'o' }); // THROWS (Ambiguous for parent)
channelTree.prefix.for({ nestedId: 'n' }); // THROWS (Invalid param for parent's .for)

// Calling the RESOLVED NESTED node ('resolvedNestedNode.for'):
resolvedNestedNode.for({}); // THROWS (Expected {nestedId})
resolvedNestedNode.for({ otherId: 'o' }); // THROWS (Invalid param for nested's .for)
resolvedNestedNode.for({ nestedId: 'n', paramId: 'p' }); // THROWS (Invalid extra param for nested's .for)
```

## Configuration Conflicts

The `channels` entrypoint includes runtime checks to prevent certain ambiguous or conflicting configurations.

### Allowed Overlap: Parameterized Tree vs. Static Sibling

It is **allowed** to define a static channel endpoint (e.g., `prefix.child`) alongside a parameterized nested tree (e.g., `prefix.{paramId}`) where the nested tree _also_ defines a child with the same name (`child`).

```typescript
// 1. Nested tree definition
const nestedTree = defineChannels({ child: [z.string()] });

// 2. Configuration with overlap
const config = {
  'prefix.{paramId}': nestedTree, // Implicitly defines 'prefix.child' *after* resolution
  'prefix.child': [z.number()], // Explicit static definition
} satisfies ChannelDefinitionConfig;

// 3. Define channels - This does NOT throw
const channels = defineChannels(config);

// 4. Accessing the distinct paths
channels.prefix.child.emit(123); // Accesses the static z.number() endpoint

const resolved = channels.prefix.for({ paramId: 'test' });
resolved.child.emit('abc'); // Accesses the nested z.string() endpoint
```

This configuration is permitted because the runtime can clearly distinguish between accessing the static path directly (`channels.prefix.child`) and accessing the path within the resolved parameterized node (`channels.prefix.for(...).child`). There is no ambiguity at access time.

### Parameter-Aware Conflicts (Runtime Error)

The runtime **will throw an error** if you define configurations that create ambiguity regarding which definition applies for a given set of parameters. These checks prevent scenarios where a single parameterized access path could resolve to either a nested tree _or_ a direct endpoint based on the same parameters.

**Specifically, conflicts arise when:**

1.  A parameterized endpoint's static path (e.g., `user.directMessages`) overlaps with the **parent** static prefix of a parameterized nested tree (`user`), **and** they expect the **same parameters** (e.g., `{userId}`).
2.  A parameterized nested tree's static prefix (`user`) overlaps with the **parent** static path of a parameterized endpoint (`user.directMessages`), **and** they expect the **same parameters**.

**Example Conflict:**

```typescript
const userChannels = defineChannels({
  directMessages: [z.object({ text: z.string() })],
});

// CONFLICT: Both definitions use '{userId}' for the 'user' segment.
const conflictingConfig = {
  'user.{userId}': userChannels, // Nested tree expects {userId} at 'user'
  'user.{userId}.directMessages': [z.object({ text: z.string() })], // Endpoint expects {userId} at 'user.directMessages'
} satisfies ChannelDefinitionConfig;

// This WILL throw a runtime error during defineChannels()
expect(() => defineChannels(conflictingConfig)).toThrow(/Configuration conflict/);
```

**Non-Conflict (Different Parameters):**

If the parameters differ, there is no conflict.

```typescript
// NO CONFLICT: Parameters {userId} and {adminUserId} are different.
const allowedConfig = {
  'user.{userId}': userChannels, // Expects userId
  'user.{adminUserId}.directMessages': [z.object({ text: z.string() })], // Expects adminUserId
} satisfies ChannelDefinitionConfig;

// This does NOT throw
expect(() => defineChannels(allowedConfig)).not.toThrow();
```

### Other Cases

- Defining the exact same static path twice generally results in the latter definition overwriting the former (standard object behavior) or potentially warnings, but is not explicitly prevented by specific conflict errors.
- Parameter names within a single definition key **must** be unique. Defining a key with duplicate parameter names (e.g., `'path.{id}.{id}'`) will cause a runtime error during `defineChannels`.

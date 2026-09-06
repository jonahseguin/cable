import { z } from 'zod';
import { describe, it, expect } from 'vitest';
import { defineChannels } from './channels.js';
import type { ChannelHandler, ChannelTreeDefinition } from '@/common';

// Note: Many tests rely on the internal implementation of emit/subscribe/validation
// which currently use console.log/warn/error. Assertions against console output
// are omitted for brevity, but could be added using vi.spyOn if needed.

// --- Exported Configurations for Shared Testing ---

export const configSimple = {
  simple: [z.string()],
  withConfig: [z.number(), { meta: 'data' }],
} satisfies ChannelTreeDefinition;

export const configDotNotation = {
  'admin.users.list': [z.array(z.string())],
  'admin.posts.config': [z.boolean(), { readOnly: true }],
} satisfies ChannelTreeDefinition;

// Nested tree structure for resolver tests
const subChannelsNested = defineChannels({
  data: [z.string()],
  '{itemId}': [z.number(), { itemType: 'generic' }],
});
export const configResolverNestedTree = {
  prefix: subChannelsNested,
  other: [z.boolean()],
} satisfies ChannelTreeDefinition;

export const configParameterized = {
  'admin.{teamId}.settings': [z.object({ enabled: z.boolean() }), { scope: 'team' }],
  'admin.{teamId}.users': [z.array(z.string())],
} satisfies ChannelTreeDefinition;

// Config only used in resolver tests previously
export const configMultiParam = {
  'room.{roomId}.chat.{messageId}': [z.object({ text: z.string() })],
} satisfies ChannelTreeDefinition;

// Config for consolidated .for tests
const nestedWithRootFor = defineChannels({
  '{itemId}': [z.string(), { scope: 'item' }],
});
export const configConsolidatedFor = {
  prefix: nestedWithRootFor, // Contains {itemId}
  'prefix.{subId}': [z.number(), { scope: 'sub' }], // Also on prefix
} satisfies ChannelTreeDefinition;

// Config for root parameter tests
export const configRootParams = {
  '{userId}': [z.string(), { scope: 'user' }],
  '{orgId}.members': [z.array(z.string()), { scope: 'org' }],
} satisfies ChannelTreeDefinition;

// --- Test Suites ---

describe('defineChannels', () => {
  it('should handle simple non-parameterized channels defined with tuple format', () => {
    const config = {
      simple: [z.string()],
      withConfig: [z.number(), { meta: 'data' }],
    } satisfies ChannelTreeDefinition;
    const channels = defineChannels(config);

    expect(channels.simple.emit).toBeDefined();
    expect(channels.simple.config).toBeUndefined();

    expect(channels.withConfig.emit).toBeDefined();
    expect(channels.withConfig.config).toEqual({ meta: 'data' });

    expect(() => channels.simple.emit('hello')).not.toThrow();
  });

  it('should handle simple non-parameterized channels defined with object format', () => {
    const config = {
      simple: { schema: z.string() },
      withConfig: { schema: z.number(), config: { meta: 'data' } },
    } satisfies ChannelTreeDefinition;
    const channels = defineChannels(config);

    expect(channels.simple.emit).toBeDefined();
    expect(channels.simple.config).toBeUndefined();
    expect(channels.withConfig.emit).toBeDefined();
    expect(channels.withConfig.config).toEqual({ meta: 'data' });
    expect(() => channels.simple.emit('world')).not.toThrow();
  });

  it('should handle dot-separated non-parameterized channels', () => {
    const config = {
      'admin.users.list': [z.array(z.string())],
      'admin.posts.config': [z.boolean(), { readOnly: true }],
    } satisfies ChannelTreeDefinition;
    const channels = defineChannels(config);

    expect(channels.admin.users.list.emit).toBeDefined();
    expect(channels.admin.users.list.config).toBeUndefined();
    expect(channels.admin.posts.config.emit).toBeDefined();
    expect(channels.admin.posts.config.config).toEqual({ readOnly: true });

    expect(() => channels.admin.users.list.emit(['user1', 'user2'])).not.toThrow();
  });

  // Test nesting pre-built trees
  it('should handle nested pre-defined channel trees', () => {
    const subChannels = defineChannels({
      data: [z.string()],
      '{itemId}': [z.number(), { itemType: 'generic' }],
    });

    const config = {
      prefix: subChannels,
      other: [z.boolean()],
    } satisfies ChannelTreeDefinition;
    const channels = defineChannels(config);

    // Check static nested path IS accessible
    expect(channels.prefix.data.emit).toBeDefined();
    expect(() => channels.prefix.data.emit('nested data')).not.toThrow();

    // Check that the parameterized part IS accessible via .for on the prefix node
    expect(channels.prefix.for).toBeDefined();

    // Check usage of the nested .for
    const itemChannel = channels.prefix.for({ itemId: 'testItem' });
    expect(itemChannel.emit).toBeDefined();
    expect(itemChannel.config).toEqual({ itemType: 'generic' });
    expect(() => itemChannel.emit(42)).not.toThrow();

    // Check that 'other' property is also accessible
    expect(channels.other.emit).toBeDefined();
    expect(() => channels.other.emit(true)).not.toThrow();
  });

  // Test dot-notation with param segment
  it('should handle dot-separated parameterized channels via leaf .for()', () => {
    const config = {
      'admin.{teamId}.settings': [z.object({ enabled: z.boolean() }), { scope: 'team' }],
      'admin.{teamId}.users': [z.array(z.string())],
    } satisfies ChannelTreeDefinition;

    expect(() => defineChannels(config)).not.toThrow();
    const channels = defineChannels(config);

    // Check structure exists
    expect(channels.admin).toBeDefined();
    expect(channels.admin.settings).toBeDefined();
    expect(channels.admin.settings.for).toBeDefined();
    expect(channels.admin.users).toBeDefined();
    expect(channels.admin.users.for).toBeDefined();

    // Test settings path
    const teamSettings = channels.admin.settings.for({ teamId: 'team-abc' });
    expect(teamSettings.emit).toBeDefined();
    expect(teamSettings.config).toEqual({ scope: 'team' });
    expect(() => teamSettings.emit({ enabled: true })).not.toThrow();

    // Test users path
    const teamUsers = channels.admin.users.for({ teamId: 'team-abc' });
    expect(teamUsers.emit).toBeDefined();
    expect(teamUsers.config).toBeUndefined();
    expect(() => teamUsers.emit(['user1', 'user2'])).not.toThrow();

    // Test parameter validation in .for (runtime checks)
    // @ts-expect-error - Missing param (TS check is still valid)
    expect(() => channels.admin.settings.for({})).toThrow(/^Invalid parameters for .for call./);
    // @ts-expect-error - Extra param (TS check is still valid)
    expect(() => channels.admin.settings.for({ teamId: 't1', extra: 'x' })).toThrow(
      /^Invalid parameters for .for call./,
    );
  });

  it('should perform payload validation on emit (and not throw)', () => {
    const config = {
      strict: [z.object({ id: z.number() })],
    } satisfies ChannelTreeDefinition;
    const channels = defineChannels(config);
    expect(() => channels.strict.emit({ id: 123 })).not.toThrow();
    // Invalid emit should be caught and logged by the implementation, not throw
    expect(() => channels.strict.emit({ id: 'not-a-number' } as any)).not.toThrow();
  });

  it('should warn and skip static channel with invalid (ZodNever) schema', () => {
    const config = {
      valid: [z.string()],
      neverSchema: [z.never()],
    } satisfies ChannelTreeDefinition;
    const channels = defineChannels(config);
    expect(channels.valid.emit).toBeDefined();
    expect(channels.neverSchema).toBeUndefined();
  });

  it('should warn and skip channel with invalid definition type', () => {
    const config = {
      valid: [z.string()],
      // @ts-ignore - Testing runtime handling of invalid type
      invalidType: 123,
    };
    const channels = defineChannels(config as any);
    expect((channels as any).valid.emit).toBeDefined();
    expect((channels as any).invalidType).toBeUndefined();
  });

  it('should handle conflicting root .for definitions (explicit vs. nested)', () => {
    const nestedWithRootFor = defineChannels({
      '{itemId}': [z.string()],
    });

    const config = {
      '{userId}': [z.number()], // Explicit root param
      nested: nestedWithRootFor, // Nested tree with its own root param
    } satisfies ChannelTreeDefinition;

    const channels = defineChannels(config);

    // Check which .for method resulted from consolidation.
    // The runtime consolidates all root-level .for definitions into one.
    // Calls must match one of the defined parameter sets exactly.
    expect(channels.for).toBeDefined();
    // Call with userId should work (matches the explicit definition)
    expect(() => channels.for({ userId: '123' })).not.toThrow();
    // Call with itemId should FAIL runtime validation
    // @ts-expect-error
    expect(() => channels.for({ itemId: 'abc' })).toThrow(/^Invalid parameters for .for call./);
  });

  it('should consolidate multiple parameter definitions onto a single .for method', () => {
    // Setup: Nested tree with its own root parameter
    const nestedWithRootFor = defineChannels({
      '{itemId}': [z.string(), { scope: 'item' }],
    });

    // Setup: Config where the nested tree is placed at 'prefix',
    // AND there's another parameterized channel also attached to 'prefix'
    const config = {
      prefix: nestedWithRootFor, // Contains {itemId}
      'prefix.{subId}': [z.number(), { scope: 'sub' }], // Also on prefix
    } satisfies ChannelTreeDefinition;

    const channels = defineChannels(config);

    // Verify the consolidated .for exists on prefix
    expect(channels.prefix.for).toBeDefined();

    // Verify the consolidated .for handles the {subId} param correctly
    const subChannel = channels.prefix.for({ subId: 'sub123' });
    expect(subChannel).toBeDefined();
    expect(subChannel.config).toEqual({ scope: 'sub' });
    expect(() => subChannel.emit(456)).not.toThrow();

    // Verify the consolidated .for *also* handles the {itemId} param correctly
    const itemChannel = channels.prefix.for({ itemId: 'itemABC' });
    expect(itemChannel).toBeDefined();
    expect(itemChannel.config).toEqual({ scope: 'item' });
    expect(() => itemChannel.emit('test-item-payload')).not.toThrow();

    // Verify calls with incorrect/ambiguous parameters fail
    // @ts-expect-error - Empty object
    expect(() => channels.prefix.for({})).toThrow(/^Invalid parameters for .for call./);
    // @ts-expect-error - Both parameters (ambiguous for runtime)
    expect(() => channels.prefix.for({ itemId: 'i', subId: 's' })).toThrow(
      /^Invalid parameters for .for call./,
    );
    // @ts-expect-error - Wrong parameter
    expect(() => channels.prefix.for({ unknown: 'x' })).toThrow(
      /^Invalid parameters for .for call./,
    );
    // @ts-expect-error - Correct param plus extra
    expect(() => channels.prefix.for({ itemId: 'i', extra: 'e' })).toThrow(
      /^Invalid parameters for .for call./,
    );
  });
});

describe('Consolidated Root .for() Method', () => {
  const config = {
    '{userId}': [z.string(), { scope: 'user' }],
    '{groupId}': [z.number(), { scope: 'group' }],
    static: [z.boolean()],
  } satisfies ChannelTreeDefinition;

  const channels = defineChannels(config);

  it('should define a single .for method on the root', () => {
    expect(channels.for).toBeDefined();
    expect(typeof channels.for).toBe('function');
    // @ts-expect-error
    expect(channels['{userId}']).toBeUndefined();
    // @ts-expect-error
    expect(channels['{groupId}']).toBeUndefined();
    expect(channels.static.emit).toBeDefined();
  });

  it('should correctly dispatch to the {userId} definition', () => {
    const userChannel = channels.for({ userId: 'user-123' });
    expect(userChannel).toBeDefined();
    expect(userChannel.emit).toBeDefined();
    expect(userChannel.config).toEqual({ scope: 'user' });
    expect(() => userChannel.emit('test message')).not.toThrow();
    expect(() => userChannel.emit(123 as any)).not.toThrow();
  });

  it('should correctly dispatch to the {groupId} definition', () => {
    const groupChannel = channels.for({ groupId: 'group-456' });
    expect(groupChannel).toBeDefined();
    expect(groupChannel.emit).toBeDefined();
    expect(groupChannel.config).toEqual({ scope: 'group' });
    expect(() => groupChannel.emit(789)).not.toThrow();
    expect(() => groupChannel.emit('wrong type' as any)).not.toThrow();
  });

  it('should throw error if called with incorrect parameters', () => {
    // @ts-expect-error
    expect(() => channels.for({})).toThrow(/^Invalid parameters for .for call./);
    // @ts-expect-error
    expect(() => channels.for({ userId: 'u1', groupId: 'g1' })).toThrow(
      /^Invalid parameters for .for call./,
    );
    // @ts-expect-error
    expect(() => channels.for({ teamId: 't1' })).toThrow(/^Invalid parameters for .for call./);
    // @ts-expect-error
    expect(() => channels.for({ userId: 'u1', extra: 'e' })).toThrow(
      /^Invalid parameters for .for call./,
    );
  });
});

describe('Consolidated Non-Root .for() Method', () => {
  const config = {
    'notifications.{userId}': [z.object({ msg: z.string() }), { scope: 'user' }],
    'notifications.{groupId}': [z.object({ count: z.number() }), { scope: 'group' }],
    'notifications.global': [z.boolean()],
    other: [z.null()],
  } satisfies ChannelTreeDefinition;

  const channels = defineChannels(config);

  it('should define a single .for method on the non-root node', () => {
    expect(channels.notifications).toBeDefined();
    expect(channels.notifications.for).toBeDefined();
    expect(typeof channels.notifications.for).toBe('function');
    // @ts-expect-error
    expect(channels.notifications['{userId}']).toBeUndefined();
    // @ts-expect-error
    expect(channels.notifications['{groupId}']).toBeUndefined();
    expect(channels.notifications.global.emit).toBeDefined();
    expect(channels.other.emit).toBeDefined();
  });

  it('should correctly dispatch to the notifications.{userId} definition', () => {
    const userNotifyChannel = channels.notifications.for({ userId: 'user-abc' });
    expect(userNotifyChannel).toBeDefined();
    expect(userNotifyChannel.emit).toBeDefined();
    expect(userNotifyChannel.config).toEqual({ scope: 'user' });
    expect(() => userNotifyChannel.emit({ msg: 'Hello user!' })).not.toThrow();
    expect(() => userNotifyChannel.emit({ msg: 123 } as any)).not.toThrow();
  });

  it('should correctly dispatch to the notifications.{groupId} definition', () => {
    const groupNotifyChannel = channels.notifications.for({ groupId: 'group-xyz' });
    expect(groupNotifyChannel).toBeDefined();
    expect(groupNotifyChannel.emit).toBeDefined();
    expect(groupNotifyChannel.config).toEqual({ scope: 'group' });
    expect(() => groupNotifyChannel.emit({ count: 5 })).not.toThrow();
    expect(() => groupNotifyChannel.emit({ count: 'five' } as any)).not.toThrow();
  });

  it('should throw error if called with incorrect parameters on non-root .for', () => {
    // @ts-expect-error
    expect(() => channels.notifications.for({})).toThrow(/^Invalid parameters for .for call./);
    // @ts-expect-error
    expect(() => channels.notifications.for({ userId: 'u1', groupId: 'g1' })).toThrow(
      /^Invalid parameters for .for call./,
    );
    // @ts-expect-error
    expect(() => channels.notifications.for({ teamId: 't1' })).toThrow(
      /^Invalid parameters for .for call./,
    );
    // @ts-expect-error
    expect(() => channels.notifications.for({ userId: 'u1', extra: 'e' })).toThrow(
      /^Invalid parameters for .for call./,
    );
  });
});

// Test nesting under a parameterized key
it('should handle nesting a tree under a parameterized key', () => {
  // Define a nested tree
  const nestedTree = defineChannels({
    staticChild: [z.string()],
    '{nestedParamId}': [z.number(), { scope: 'nested' }],
  });

  // Nest it directly under a parameterized key
  const config = {
    'prefix.{paramId}': nestedTree,
    // Add a sibling static channel to ensure it coexists
    'prefix.sibling': [z.boolean()],
  } satisfies ChannelTreeDefinition;

  const channels = defineChannels(config);

  // 1. Access the node via the outer parameter
  expect(channels.prefix.for).toBeDefined();
  const resolvedPrefix = channels.prefix.for({ paramId: 'testValue' });

  // 2. Check access to the static child within the resolved nested tree
  expect(resolvedPrefix.staticChild).toBeDefined();
  expect(resolvedPrefix.staticChild.emit).toBeDefined();
  expect(() => resolvedPrefix.staticChild.emit('hello nested static')).not.toThrow();

  // 3. Check access to the parameterized child within the resolved nested tree
  expect(resolvedPrefix.for).toBeDefined();
  const resolvedNested = resolvedPrefix.for({ nestedParamId: '123' });
  expect(resolvedNested).toBeDefined();
  expect(resolvedNested.emit).toBeDefined();
  expect(resolvedNested.config).toEqual({ scope: 'nested' });
  expect(() => resolvedNested.emit(456)).not.toThrow();

  // 4. Check access to the static sibling defined alongside the parameterized key
  expect(channels.prefix.sibling).toBeDefined();
  expect(channels.prefix.sibling.emit).toBeDefined();
  expect(() => channels.prefix.sibling.emit(true)).not.toThrow();

  // 5. Check parameter validation on the nested .for
  // @ts-expect-error - Missing nested param
  expect(() => resolvedPrefix.for({})).toThrow(/^Invalid parameters for .for call./);
  // @ts-expect-error - Wrong nested param
  expect(() => resolvedPrefix.for({ wrongParam: 99 })).toThrow(
    /^Invalid parameters for .for call./,
  );
});

describe('Consolidation with Complex Nesting', () => {
  // Config described in docs for this scenario
  const nestedTree = defineChannels({
    '{nestedId}': [z.string(), { scope: 'nested' }], // Nested tree's def expects {nestedId}
  });
  const config = {
    'prefix.{paramId}': nestedTree, // Nested tree under param
    'prefix.{otherId}': [z.number(), { scope: 'direct' }], // Direct def on prefix expects {otherId}
    'prefix.staticSibling': [z.boolean()], // Ensure static sibling coexists
  } satisfies ChannelTreeDefinition;

  const channelTree = defineChannels(config);

  it('should access direct endpoint via parent .for', () => {
    const directEndpoint = channelTree.prefix.for({ otherId: 'o1' });
    expect(directEndpoint).toBeDefined();
    expect(directEndpoint.emit).toBeDefined();
    expect(directEndpoint.config).toEqual({ scope: 'direct' });
    expect(() => directEndpoint.emit(123)).not.toThrow();
  });

  it('should resolve nested tree via parent .for', () => {
    const resolvedNestedNode = channelTree.prefix.for({ paramId: 'p1' });
    expect(resolvedNestedNode).toBeDefined();
    // Check if it looks like the nested tree (has the nested .for)
    expect(resolvedNestedNode.for).toBeDefined();
    // Check it doesn't have the direct endpoint's methods
    expect((resolvedNestedNode as any).emit).toBeUndefined();
  });

  it('should access nested endpoint via resolved nested node .for', () => {
    const resolvedNestedNode = channelTree.prefix.for({ paramId: 'p1' });
    const nestedEndpoint = resolvedNestedNode.for({ nestedId: 'n1' });
    expect(nestedEndpoint).toBeDefined();
    expect(nestedEndpoint.emit).toBeDefined();
    expect(nestedEndpoint.config).toEqual({ scope: 'nested' });
    expect(() => nestedEndpoint.emit('hello nested')).not.toThrow();
  });

  it('should access static sibling alongside consolidated .for', () => {
    expect(channelTree.prefix.staticSibling).toBeDefined();
    expect(channelTree.prefix.staticSibling.emit).toBeDefined();
    expect(() => channelTree.prefix.staticSibling.emit(false)).not.toThrow();
  });

  it('should throw errors for invalid calls on PARENT .for', () => {
    // Ensure .for doesn't exist on the root for this config, or calling it fails appropriately
    // @ts-expect-error - Testing invalid runtime call
    // expect(() => channelTree.for({ otherId: 'o1' })).toThrow(/^Invalid parameters for .for call./);
    // Corrected Assertion: .for should not exist on the root node in this config
    expect(channelTree.for).toBeUndefined();
  });

  it('should throw errors for invalid calls on RESOLVED NESTED .for', () => {
    const resolvedNestedNode = channelTree.prefix.for({ paramId: 'p1' });
    // @ts-expect-error
    expect(() => resolvedNestedNode.for({})).toThrow(/^Invalid parameters for .for call./); // Expected {nestedId}
    // @ts-expect-error
    expect(() => resolvedNestedNode.for({ otherId: 'o' })).toThrow(
      /^Invalid parameters for .for call./,
    ); // Wrong param for nested
    // @ts-expect-error
    expect(() => resolvedNestedNode.for({ nestedId: 'n', paramId: 'p' })).toThrow(
      /^Invalid parameters for .for call./,
    ); // Extra param for nested
  });
});

describe('Parameter-Aware Conflict Validation', () => {
  it('should ALLOW non-conflicting overlap (different params)', () => {
    const userChannels = defineChannels({
      directMessages: [z.object({ text: z.string() })],
    });
    const config = {
      'user.{userId}': userChannels, // Expects userId
      'user.{adminUserId}.directMessages': [z.object({ text: z.string() })], // Expects adminUserId
    } satisfies ChannelTreeDefinition;

    // Should NOT throw, params are different
    expect(() => defineChannels(config)).not.toThrow();

    // Optional: Verify structure is built as expected
    const channels = defineChannels(config);
    expect(channels.user.for).toBeDefined();
    expect(channels.user.directMessages.for).toBeDefined();
  });

  it('should THROW on conflict: parameterized nested tree vs. parameterized endpoint (same params)', () => {
    const userChannels = defineChannels({
      directMessages: [z.object({ text: z.string() })],
    });
    const config = {
      'user.{userId}': userChannels,
      'user.{userId}.directMessages': [z.object({ text: z.string() })], // Conflict: uses same param
    } satisfies ChannelTreeDefinition;

    // Should throw due to registry check
    expect(() => defineChannels(config)).toThrow(
      /Configuration conflict: Parameterized endpoint .* conflicts with a nested tree definition/,
    );
  });

  it('should THROW on conflict: parameterized endpoint vs. parameterized nested tree (same params)', () => {
    const userChannels = defineChannels({
      directMessages: [z.object({ text: z.string() })],
    });
    const config = {
      'user.{userId}.directMessages': [z.object({ text: z.string() })], // Defined first
      'user.{userId}': userChannels, // Conflict: uses same param
    } satisfies ChannelTreeDefinition;

    // Should throw due to registry check
    expect(() => defineChannels(config)).toThrow(
      /Configuration conflict: Parameterized nested tree .* conflicts with endpoint definition/,
    );
  });

  // Re-added test to explicitly check allowed overlap
  it('should ALLOW parameterized nested tree to implicitly define paths overlapping static siblings', () => {
    const nestedTree = defineChannels({ child: [z.string()] });
    const config = {
      'prefix.{paramId}': nestedTree, // Parameterized definition implies 'prefix.child' will exist *after* .for({paramId: '...'}) is called
      'prefix.child': [z.number()], // Direct static definition ('prefix.child') is allowed alongside the parameterized definition ('prefix.{paramId}')
    } satisfies ChannelTreeDefinition;

    // This configuration is allowed because the runtime distinguishes between the static path
    // ('prefix.child') and the parameterized path resolution ('prefix.for(...).child').
    // Therefore, defineChannels should not throw.
    expect(() => defineChannels(config)).not.toThrow();

    // Verify structure to confirm both parts exist and are accessible correctly
    const channels = defineChannels(config);
    expect(channels.prefix.child.emit).toBeDefined(); // Static child exists directly
    expect(channels.prefix.for).toBeDefined(); // .for from param exists on prefix
    const resolvedNested = channels.prefix.for({ paramId: 'test' });
    expect(resolvedNested.child.emit).toBeDefined(); // Nested child exists within resolved .for
  });
});

describe('Definition Key Validation', () => {
  it('should throw a runtime error for duplicate parameter names in a key', () => {
    const configWithDuplicateParams = {
      'path.{id}.{id}': { schema: z.string() }, // Invalid key, use object syntax
    };

    expect(() => defineChannels(configWithDuplicateParams)).toThrow(
      /Invalid channel definition key .* Duplicate parameter names found/,
    );
  });
});

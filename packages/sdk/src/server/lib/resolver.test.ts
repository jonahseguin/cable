import { z } from 'zod';
import { describe, it, expect } from 'vitest';
import { defineChannels, getChannelIdentifier } from './channels';
import {
  configSimple,
  configDotNotation,
  configResolverNestedTree,
  configParameterized,
  configMultiParam,
  configConsolidatedFor,
  configRootParams,
} from './channels.test.js';
import { resolveEndpointFromTree } from './resolver';

// --- Tests --- //

describe('resolveEndpointFromTree', () => {
  const treeSimple = defineChannels(configSimple);
  const treeDotNotation = defineChannels(configDotNotation);
  const treeNestedTree = defineChannels(configResolverNestedTree);
  const treeParameterized = defineChannels(configParameterized);
  const treeMultiParam = defineChannels(configMultiParam);
  const treeConsolidatedFor = defineChannels(configConsolidatedFor);
  const treeRootParams = defineChannels(configRootParams);

  // === Static Paths ===
  it('should resolve simple static paths', () => {
    expect(resolveEndpointFromTree(treeSimple, 'simple', {})).toBe('simple');
    expect(resolveEndpointFromTree(treeSimple, 'withConfig', {})).toBe('withConfig');
  });

  it('should resolve dot-notation static paths', () => {
    expect(resolveEndpointFromTree(treeDotNotation, 'admin.users.list', {})).toBe(
      'admin.users.list',
    );
    expect(resolveEndpointFromTree(treeDotNotation, 'admin.posts.config', {})).toBe(
      'admin.posts.config',
    );
  });

  it('should resolve static paths within nested trees', () => {
    expect(resolveEndpointFromTree(treeNestedTree, 'prefix.data', {})).toBe('prefix.data');
    expect(resolveEndpointFromTree(treeNestedTree, 'other', {})).toBe('other');
  });

  // === Parameterized Paths ===
  it('should resolve simple parameterized paths and match getChannelIdentifier', () => {
    const params1 = { teamId: 't1' };
    const resolvedPath1 = resolveEndpointFromTree(treeParameterized, 'admin.settings', params1);
    expect(resolvedPath1).toBe('admin.t1##teamId.settings');
    expect(resolvedPath1).toBe(getChannelIdentifier(treeParameterized.admin.settings.for(params1)));

    const params2 = { teamId: 't2' };
    const resolvedPath2 = resolveEndpointFromTree(treeParameterized, 'admin.users', params2);
    expect(resolvedPath2).toBe('admin.t2##teamId.users');
    expect(resolvedPath2).toBe(getChannelIdentifier(treeParameterized.admin.users.for(params2)));
  });

  it('should resolve parameterized paths within nested trees and match getChannelIdentifier', () => {
    const params = { itemId: 'item123' };
    const resolvedPath = resolveEndpointFromTree(treeNestedTree, 'prefix', params);
    expect(resolvedPath).toBe('prefix.item123##itemId');
    expect(resolvedPath).toBe(getChannelIdentifier(treeNestedTree.prefix.for(params)));
  });

  it('should resolve paths with multiple parameter segments and match getChannelIdentifier', () => {
    const params = { roomId: 'rABC', messageId: 'mXYZ' };
    const resolvedPath = resolveEndpointFromTree(treeMultiParam, 'room.chat', params);
    expect(resolvedPath).toBe('room.rABC##roomId.chat.mXYZ##messageId');
    expect(resolvedPath).toBe(getChannelIdentifier(treeMultiParam.room.chat.for(params)));

    const paramsReordered = { messageId: 'mXYZ', roomId: 'rABC' };
    const resolvedPathReordered = resolveEndpointFromTree(
      treeMultiParam,
      'room.chat',
      paramsReordered,
    );
    expect(resolvedPathReordered).toBe('room.rABC##roomId.chat.mXYZ##messageId');
    expect(resolvedPathReordered).toBe(
      getChannelIdentifier(treeMultiParam.room.chat.for(paramsReordered)),
    );
  });

  it('should resolve paths with consolidated .for definitions and match getChannelIdentifier', () => {
    const paramsItemId = { itemId: 'item-456' };
    const resolvedPathItemId = resolveEndpointFromTree(treeConsolidatedFor, 'prefix', paramsItemId);
    expect(resolvedPathItemId).toBe('prefix.item-456##itemId');
    expect(resolvedPathItemId).toBe(
      getChannelIdentifier(treeConsolidatedFor.prefix.for(paramsItemId)),
    );

    const paramsSubId = { subId: 'sub-789' };
    const resolvedPathSubId = resolveEndpointFromTree(treeConsolidatedFor, 'prefix', paramsSubId);
    expect(resolvedPathSubId).toBe('prefix.sub-789##subId');
    expect(resolvedPathSubId).toBe(
      getChannelIdentifier(treeConsolidatedFor.prefix.for(paramsSubId)),
    );
  });

  it('should resolve paths defined at the root with parameters and match getChannelIdentifier', () => {
    const paramsUser = { userId: 'usr1' };
    const resolvedPathUser = resolveEndpointFromTree(treeRootParams, '', paramsUser);
    expect(resolvedPathUser).toBe('usr1##userId');
    expect(resolvedPathUser).toBe(getChannelIdentifier(treeRootParams.for(paramsUser)));

    const paramsOrg = { orgId: 'orgABC' };
    const resolvedPathOrg = resolveEndpointFromTree(treeRootParams, 'members', paramsOrg);
    expect(resolvedPathOrg).toBe('orgABC##orgId.members');
    expect(resolvedPathOrg).toBe(getChannelIdentifier(treeRootParams.members.for(paramsOrg)));
  });

  // === Error Cases ===
  it('should throw for invalid static path segments', () => {
    expect(() => resolveEndpointFromTree(treeSimple, 'simple.invalid', {})).toThrow(
      /Channel path "simple.invalid" not found./,
    );
    expect(() => resolveEndpointFromTree(treeDotNotation, 'admin.users.list.deep', {})).toThrow(
      /Channel path "admin.users.list.deep" not found./,
    );
    expect(() => resolveEndpointFromTree(treeNestedTree, 'prefix.nonexistent', {})).toThrow(
      /Channel path "prefix.nonexistent" not found./,
    );
  });

  it('should throw if parameters are provided for a static path', () => {
    expect(() => resolveEndpointFromTree(treeSimple, 'simple', { invalid: 'param' })).toThrow(
      /Path "simple" resolves to a static endpoint, but parameters were provided/,
    );
    expect(() =>
      resolveEndpointFromTree(treeDotNotation, 'admin.users.list', { teamId: 't1' }),
    ).toThrow(
      /Path "admin.users.list" resolves to a static endpoint, but parameters were provided/,
    );
  });

  it('should throw if path leads to parameterized node but no parameters are provided', () => {
    expect(() => resolveEndpointFromTree(treeParameterized, 'admin.settings', {})).toThrow(
      /Path "admin.settings" requires parameters, but none were provided./,
    );
    expect(() => resolveEndpointFromTree(treeMultiParam, 'room.chat', { roomId: 'r1' })).toThrow(
      /Invalid parameters provided for path "room.chat".*Provided:.*Expected signatures like:.*{messageId,roomId}/,
    );
    expect(() => resolveEndpointFromTree(treeRootParams, '', {})).toThrow(
      /Path "" requires parameters, but none were provided./,
    );
  });

  it('should throw if path leads to parameterized node but wrong parameters are provided', () => {
    expect(() =>
      resolveEndpointFromTree(treeParameterized, 'admin.settings', { wrong: 'p' }),
    ).toThrow(
      // Revert to exact string match for debugging
      'Invalid parameters provided for path "admin.settings". Provided: {"wrong":"p"}. Expected signatures like: {teamId}',
    );
    expect(() =>
      resolveEndpointFromTree(treeMultiParam, 'room.chat', {
        roomId: 'r1',
        wrong: 'p',
      }),
    ).toThrow(
      // Revert to exact string match for debugging (use sorted signature)
      'Invalid parameters provided for path "room.chat". Provided: {"roomId":"r1","wrong":"p"}. Expected signatures like: {messageId,roomId}',
    );
    expect(() => resolveEndpointFromTree(treeRootParams, '', { orgId: 'o1' })).toThrow(
      // Corrected: The '' path only expects {userId} based on map structure
      'Invalid parameters provided for path "". Provided: {"orgId":"o1"}. Expected signatures like: {userId}',
    );
  });

  it('should throw if path leads to node that is not static or parameterized', () => {
    // e.g., navigating halfway into a dot-notation path
    expect(() => resolveEndpointFromTree(treeDotNotation, 'admin.users', {})).toThrow(
      /Channel path "admin.users" not found./,
    );
    expect(() => resolveEndpointFromTree(treeDotNotation, 'admin', {})).toThrow(
      /Channel path "admin" not found./,
    );
  });

  it('should handle (pass through) extra parameters and match getChannelIdentifier', () => {
    const params = { teamId: 't1', extra: 'data' };
    const resolvedPath = resolveEndpointFromTree(treeParameterized, 'admin.settings', params);
    expect(resolvedPath).toBe('admin.t1##teamId.settings');
  });
});

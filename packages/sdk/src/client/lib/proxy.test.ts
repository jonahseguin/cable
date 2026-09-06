import { describe, it, expect, vi } from 'vitest';
import { createChannelProxy, type ChannelSpec } from './proxy.js';
import { z } from 'zod';
import { defineChannels } from '@/server';
import { type ChannelHandler } from '@/common';

const testChannels = defineChannels({
  'static.simple': [z.object({ data: z.string() })],
  'user.{userId}.profile': [z.object({ name: z.string() })],
});

const mockHandler = vi.fn() as ChannelHandler<any>;

describe('Client SDK Proxy', () => {
  it('should return static path and empty params for static channels', () => {
    const client = createChannelProxy<typeof testChannels>();
    const result = client.static.simple;

    expect((result as unknown as ChannelSpec).staticPath).toBe('static.simple');
    expect((result as unknown as ChannelSpec).params).toEqual({});
  });

  it('should return static path and parameters for parameterized channels', () => {
    const client = createChannelProxy<typeof testChannels>();
    const result = client.user.profile.for({ userId: '123' });

    expect((result as unknown as ChannelSpec).staticPath).toBe('user.profile');
    expect((result as unknown as ChannelSpec).params).toEqual({ userId: '123' });
  });

  it('should throw error if .for() is called with zero parameters', () => {
    const client = createChannelProxy<typeof testChannels>();
    expect(() => {
      // @ts-expect-error - Testing runtime check for empty object
      client.user.profile.for({});
    }).toThrow(/expects at least one parameter/);
  });
});

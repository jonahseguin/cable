import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { [removed]ConnectionManager, ConnectionState, type ConnectionConfig } from './connection.js';
import { defineChannels, getChannelIdentifier } from '@/server';
import { z } from 'zod';

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  readyState = 0; // CONNECTING

  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }

  // Helper to simulate incoming messages
  simulateMessage(data: { channel: string; payload: any }) {
    if (this.onmessage) {
      this.onmessage({
        data: JSON.stringify({
          channel: data.channel,
          payload: JSON.stringify(data.payload),
        }),
      });
    }
  }

  // Helper to simulate connection open
  simulateOpen() {
    this.readyState = 1; // OPEN
    if (this.onopen) this.onopen();
  }

  // Helper to simulate error
  simulateError(error: Error) {
    if (this.onerror) {
      this.onerror(error);
    }
    // WebSocket errors normally trigger close too
    if (this.onclose) {
      this.onclose();
    }
  }
}

// Store the original WebSocket
const originalWebSocket = global.WebSocket;
const originalFetch = global.fetch;

// Define a test channel tree for our tests
const testChannels = defineChannels({
  notifications: [z.object({ message: z.string() })],
  'global.chat': [z.object({ text: z.string(), user: z.string() })],
  'user.{userId}': [z.object({ name: z.string(), role: z.string() })],
  'user.{userId}.profile': [z.object({ avatar: z.string(), status: z.string() })],
  'chat.{roomId}.messages': [z.object({ text: z.string(), sender: z.string() })],
  'user.{userId}.notifications': [z.object({ message: z.string() })],
  'room.{roomId}.messages': [z.object({ text: z.string(), sender: z.string() })],
  'stats.{period}': [z.object({ visitors: z.number(), conversions: z.number() })],
  'version.{semver}': [z.object({ releaseNotes: z.string() })],
  'path.{fullPath}': [z.object({ content: z.string() })],
  'chat.{roomId}.{userId}': [z.object({ text: z.string(), privateMessage: z.boolean() })],
  'data.{year}.{quarter}': [z.object({ revenue: z.number() })],
});

describe('[removed]ConnectionManager', () => {
  let mockWebSocket: MockWebSocket;
  let authResponse: { socketId: string; socketToken: string; wsUrl: string; channels: string[] };
  let fetchMock: any;

  beforeEach(() => {
    // Setup fake timers
    vi.useFakeTimers();

    // Mock WebSocket
    mockWebSocket = new MockWebSocket();
    global.WebSocket = vi.fn().mockImplementation(() => mockWebSocket) as any;

    // Mock fetch
    authResponse = {
      socketId: 'socket-123',
      socketToken: 'token-abc',
      wsUrl: 'wss://api.[removed].com',
      channels: ['channel1', 'channel2'],
    };
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(authResponse),
    });
    // Use type assertion to bypass the preconnect property requirement
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    // Restore originals
    global.WebSocket = originalWebSocket;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should initialize in disconnected state', () => {
    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);
    expect(manager.state).toBe(ConnectionState.DISCONNECTED);
  });

  it('should authenticate and establish websocket connection when connect is called', async () => {
    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Start connect process (don't await yet)
    const connectPromise = manager.connect();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Should be in CONNECTING state
    expect(manager.state).toBe(ConnectionState.CONNECTING);

    // Verify fetch was called with correct endpoint
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/[removed]/connect',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );

    // Immediately simulate websocket open
    mockWebSocket.simulateOpen();

    // Run any pending promises to resolve the connection
    await vi.runAllTimersAsync();

    // Wait for connect promise to resolve
    await connectPromise;

    // Should be in CONNECTED state
    expect(manager.state).toBe(ConnectionState.CONNECTED);
  });

  it('should handle authentication failure', async () => {
    // Override fetch mock to return error
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }) as unknown as typeof fetch;

    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Connect should throw
    await expect(manager.connect()).rejects.toThrow('Authentication failed: 401 Unauthorized');

    // Should be in ERROR state
    expect(manager.state).toBe(ConnectionState.ERROR);
  });

  it('should handle WebSocket connection failure', async () => {
    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Start connect
    const connectPromise = manager.connect().catch((error) => {
      // Explicitly catch the error here to prevent unhandled rejections
      expect(error.message).toContain('Failed to establish WebSocket connection');
      // But let the test continue, we'll verify state in the test
    });

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Simulate a WebSocket error with the helper method
    mockWebSocket.simulateError(new Error('Mock WebSocket error'));

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Wait for any async operations to complete
    await vi.runAllTimersAsync();

    // Even if connect rejected, wait for it to settle before continuing
    await connectPromise;

    // Should be in ERROR state
    expect(manager.state).toBe(ConnectionState.ERROR);
  });

  it('should route incoming messages to the correct handlers', async () => {
    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Set up handlers
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    manager.subscribe('channel1', handler1);
    manager.subscribe('channel2', handler2);

    // Start connection
    const connectPromise = manager.connect();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Simulate WebSocket connection success
    mockWebSocket.simulateOpen();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Wait for connection to complete
    await connectPromise;

    // Simulate incoming messages
    mockWebSocket.simulateMessage({
      channel: 'channel1',
      payload: { data: 'message1' },
    });

    mockWebSocket.simulateMessage({
      channel: 'channel2',
      payload: { data: 'message2' },
    });

    // Check handlers were called with correct payloads
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler1).toHaveBeenCalledWith({ data: 'message1' });

    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith({ data: 'message2' });
  });

  it('should handle unsubscribe correctly', async () => {
    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Set up handler
    const handler = vi.fn();
    const unsubscribe = manager.subscribe('channel1', handler);

    // Start connection
    const connectPromise = manager.connect();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Simulate WebSocket connection success
    mockWebSocket.simulateOpen();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Wait for connection to complete
    await connectPromise;

    // Simulate first message
    mockWebSocket.simulateMessage({
      channel: 'channel1',
      payload: { data: 'message1' },
    });

    // Handler should be called
    expect(handler).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsubscribe();

    // Simulate second message
    mockWebSocket.simulateMessage({
      channel: 'channel1',
      payload: { data: 'message2' },
    });

    // Handler should not be called again
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should disconnect properly', async () => {
    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Connect
    const connectPromise = manager.connect();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Simulate WebSocket connection success
    mockWebSocket.simulateOpen();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Wait for connection to complete
    await connectPromise;

    // Should be connected
    expect(manager.state).toBe(ConnectionState.CONNECTED);

    // Disconnect
    await manager.disconnect();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Should be disconnected
    expect(manager.state).toBe(ConnectionState.DISCONNECTED);
  });

  it('should handle WebSocket events correctly', async () => {
    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Connect
    const connectPromise = manager.connect();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Simulate WebSocket connection success
    mockWebSocket.simulateOpen();

    // Run any pending promises
    await vi.runAllTimersAsync();

    // Wait for connection to complete
    await connectPromise;

    // Test WebSocket close event
    mockWebSocket.close();

    // Run any pending promises
    await vi.runAllTimersAsync();

    expect(manager.state).toBe(ConnectionState.DISCONNECTED);
  });

  it('should correctly map simple channels from auth response', async () => {
    // Mock auth response with simple channels
    authResponse.channels = ['notifications', 'global.chat'];

    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Connect to trigger channel mapping
    const connectPromise = manager.connect();
    await vi.runAllTimersAsync();
    mockWebSocket.simulateOpen();
    await vi.runAllTimersAsync();
    await connectPromise;

    // Test resolving static channels
    expect(manager.resolveChannel('notifications', {})).toBe('notifications');
    expect(manager.resolveChannel('global.chat', {})).toBe('global.chat');

    // These should fail to resolve (not in auth response)
    expect(manager.resolveChannel('unknown', {})).toBeNull();
  });

  it('should correctly map single parameterized channels', async () => {
    // Get properly formatted channel strings for auth response
    const userChannel = testChannels.user.for({ userId: '123' });
    const statsChannel = testChannels.stats.for({ period: 'daily' });

    // Mock auth response with parameterized channels using proper format
    authResponse.channels = [getChannelIdentifier(userChannel), getChannelIdentifier(statsChannel)];

    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Connect to trigger channel mapping
    const connectPromise = manager.connect();
    await vi.runAllTimersAsync();
    mockWebSocket.simulateOpen();
    await vi.runAllTimersAsync();
    await connectPromise;

    // Test resolving with correct parameter
    expect(manager.resolveChannel('user', { userId: '123' })).toBe(
      getChannelIdentifier(userChannel),
    );
    expect(manager.resolveChannel('stats', { period: 'daily' })).toBe(
      getChannelIdentifier(statsChannel),
    );

    // Test resolving with incorrect parameter values
    expect(manager.resolveChannel('user', { userId: '456' })).toBeNull();
    expect(manager.resolveChannel('stats', { period: 'weekly' })).toBeNull();

    // Test resolving with missing parameters
    expect(manager.resolveChannel('user', {})).toBeNull();
  });

  it('should correctly map channels with multiple parameters', async () => {
    // Get properly formatted channel strings for auth response
    const chatChannel = testChannels.chat.for({ roomId: 'room-abc', userId: 'user-123' });
    const dataChannel = testChannels.data.for({ year: '2023', quarter: 'q2' });

    // Mock auth response with multi-parameter channels
    authResponse.channels = [getChannelIdentifier(chatChannel), getChannelIdentifier(dataChannel)];

    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Connect to trigger channel mapping
    const connectPromise = manager.connect();
    await vi.runAllTimersAsync();
    mockWebSocket.simulateOpen();
    await vi.runAllTimersAsync();
    await connectPromise;

    // Test resolving with all parameters correct
    expect(
      manager.resolveChannel('chat', {
        roomId: 'room-abc',
        userId: 'user-123',
      }),
    ).toBe(getChannelIdentifier(chatChannel));

    expect(
      manager.resolveChannel('data', {
        year: '2023',
        quarter: 'q2',
      }),
    ).toBe(getChannelIdentifier(dataChannel));

    // Test resolving with partial parameters (should fail)
    expect(manager.resolveChannel('chat', { roomId: 'room-abc' })).toBeNull();
    expect(manager.resolveChannel('data', { year: '2023' })).toBeNull();

    // Test resolving with wrong values
    expect(
      manager.resolveChannel('chat', {
        roomId: 'room-abc',
        userId: 'wrong-user',
      }),
    ).toBeNull();
  });

  it('should correctly map channels with parameters containing dots', async () => {
    // Get properly formatted channel strings for auth response
    const versionChannel = testChannels.version.for({ semver: '1.2.3' });
    const pathChannel = testChannels.path.for({ fullPath: 'a.b.c' });

    // Mock auth response with channels having parameter values containing dots
    authResponse.channels = [
      getChannelIdentifier(versionChannel),
      getChannelIdentifier(pathChannel),
    ];

    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Connect to trigger channel mapping
    const connectPromise = manager.connect();
    await vi.runAllTimersAsync();
    mockWebSocket.simulateOpen();
    await vi.runAllTimersAsync();
    await connectPromise;

    // Test resolving with parameters containing dots
    expect(
      manager.resolveChannel('version', {
        semver: '1.2.3',
      }),
    ).toBe(getChannelIdentifier(versionChannel));

    expect(
      manager.resolveChannel('path', {
        fullPath: 'a.b.c',
      }),
    ).toBe(getChannelIdentifier(pathChannel));
  });

  it('should handle channel template regeneration correctly', async () => {
    // Get properly formatted channel strings for auth response
    const userProfileChannel = testChannels.user.profile.for({ userId: '123' });
    const chatMessagesChannel = testChannels.chat.messages.for({ roomId: 'room-abc' });

    // Mock auth response with parameterized channels
    authResponse.channels = [
      getChannelIdentifier(userProfileChannel),
      getChannelIdentifier(chatMessagesChannel),
    ];

    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Connect to trigger channel mapping
    const connectPromise = manager.connect();
    await vi.runAllTimersAsync();
    mockWebSocket.simulateOpen();
    await vi.runAllTimersAsync();
    await connectPromise;

    // Test with correct static paths
    expect(manager.resolveChannel('user.profile', { userId: '123' })).toBe(
      getChannelIdentifier(userProfileChannel),
    );
    expect(manager.resolveChannel('chat.messages', { roomId: 'room-abc' })).toBe(
      getChannelIdentifier(chatMessagesChannel),
    );
  });

  it('should correctly route messages to handlers for parameterized channels', async () => {
    // Get properly formatted channel strings for auth response
    const userNotifsChannel = testChannels.user.notifications.for({ userId: '123' });
    const roomMsgsChannel = testChannels.room.messages.for({ roomId: 'abc' });
    const statsChannel = testChannels.stats.for({ period: 'daily' });

    // Mock auth response with parameterized channels
    authResponse.channels = [
      getChannelIdentifier(userNotifsChannel),
      getChannelIdentifier(roomMsgsChannel),
      getChannelIdentifier(statsChannel),
    ];

    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // Connect to trigger channel mapping
    const connectPromise = manager.connect();
    await vi.runAllTimersAsync();
    mockWebSocket.simulateOpen();
    await vi.runAllTimersAsync();
    await connectPromise;

    // Set up handlers
    const userHandler = vi.fn();
    const roomHandler = vi.fn();
    const statsHandler = vi.fn();

    // Resolve channels and subscribe to them
    const userChannel = manager.resolveChannel('user.notifications', { userId: '123' });
    const roomChannel = manager.resolveChannel('room.messages', { roomId: 'abc' });
    const statsChannel2 = manager.resolveChannel('stats', { period: 'daily' });

    expect(userChannel).toBe(getChannelIdentifier(userNotifsChannel));
    expect(roomChannel).toBe(getChannelIdentifier(roomMsgsChannel));
    expect(statsChannel2).toBe(getChannelIdentifier(statsChannel));

    // Subscribe to the channels
    manager.subscribe(userChannel!, userHandler);
    manager.subscribe(roomChannel!, roomHandler);
    manager.subscribe(statsChannel2!, statsHandler);

    // Simulate incoming messages using the actual channel paths with metadata
    mockWebSocket.simulateMessage({
      channel: getChannelIdentifier(userNotifsChannel),
      payload: { message: 'New notification' },
    });

    mockWebSocket.simulateMessage({
      channel: getChannelIdentifier(roomMsgsChannel),
      payload: { text: 'Hello world', sender: 'Alice' },
    });

    mockWebSocket.simulateMessage({
      channel: getChannelIdentifier(statsChannel),
      payload: { visitors: 100, conversions: 10 },
    });

    // Verify the handlers were called with the correct payloads
    expect(userHandler).toHaveBeenCalledTimes(1);
    expect(userHandler).toHaveBeenCalledWith({ message: 'New notification' });

    expect(roomHandler).toHaveBeenCalledTimes(1);
    expect(roomHandler).toHaveBeenCalledWith({ text: 'Hello world', sender: 'Alice' });

    expect(statsHandler).toHaveBeenCalledTimes(1);
    expect(statsHandler).toHaveBeenCalledWith({ visitors: 100, conversions: 10 });
  });

  it('should update channel mappings when reconnecting with different auth response', async () => {
    // Get properly formatted channel strings for auth response
    const notificationsChannel = testChannels.notifications;
    const userProfileChannel = testChannels.user.profile.for({ userId: '123' });
    const chatGeneralChannel = testChannels.global.chat;
    const userProfileChannel2 = testChannels.user.profile.for({ userId: '456' });

    console.log('User profile channel 2:', getChannelIdentifier(userProfileChannel2));

    // Initial auth response
    authResponse.channels = ['notifications', getChannelIdentifier(userProfileChannel)];

    const config: ConnectionConfig = {
      authEndpoint: 'https://api.example.com/[removed]/connect',
    };

    const manager = new [removed]ConnectionManager(config);

    // First connection
    let connectPromise = manager.connect();
    await vi.runAllTimersAsync();
    mockWebSocket.simulateOpen();
    await vi.runAllTimersAsync();
    await connectPromise;

    // Verify initial mappings
    expect(manager.resolveChannel('notifications', {})).toBe('notifications');
    expect(manager.resolveChannel('user.profile', { userId: '123' })).toBe(
      getChannelIdentifier(userProfileChannel),
    );
    expect(manager.resolveChannel('user.profile', { userId: '456' })).toBeNull();

    // Disconnect
    manager.disconnect();
    await vi.runAllTimersAsync();

    // Change auth response for the second connection
    authResponse.channels = ['global.chat', getChannelIdentifier(userProfileChannel2)];

    console.log('New auth channels:', authResponse.channels);

    // Reconnect
    connectPromise = manager.connect();
    await vi.runAllTimersAsync();
    mockWebSocket.simulateOpen();
    await vi.runAllTimersAsync();
    await connectPromise;

    console.log('Attempting to resolve user.profile with userId: 456');
    const resolved = manager.resolveChannel('user.profile', { userId: '456' });
    console.log('Resolved channel:', resolved);

    // Verify updated mappings
    expect(manager.resolveChannel('notifications', {})).toBeNull(); // No longer authorized
    expect(manager.resolveChannel('user.profile', { userId: '123' })).toBeNull(); // No longer authorized
    expect(manager.resolveChannel('global.chat', {})).toBe('global.chat'); // New channel
    expect(manager.resolveChannel('user.profile', { userId: '456' })).toBe(
      getChannelIdentifier(userProfileChannel2),
    ); // New user
  });
});

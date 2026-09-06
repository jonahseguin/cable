import { type ChannelHandler, type Unsubscribe } from '@/common';
import SuperJSON from 'superjson';

/**
 * Connection states for the WebSocket
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * Configuration for the connection manager
 */
export interface ConnectionConfig {
  /**
   * Function that returns the authentication endpoint URL
   * This allows flexibility for different backend frameworks
   */
  endpoint: string;

  /**
   * Optional headers to include in the auth request
   */
  headers?: Record<string, string>;
}

/**
 * Response from the authentication endpoint with enhanced channel information
 */
export interface AuthResponse {
  endpoint: string;
  // Channel strings now contain metadata about parameters
  // Format: channelPath##paramName.value##paramName2.value2
  channels: string[];
  identity?: string;
}

// New interface for parsed channel information
interface ParsedChannel {
  // The actual channel path to subscribe to
  channel: string;
  // The template format (e.g., "notifications.{userId}")
  template: string;
  // Static path without parameters (e.g., "notifications")
  staticPath: string;
  // Parameter values for this specific channel
  params: Record<string, string>;
}

/**
 * Message structure for incoming WebSocket messages
 */
interface IncomingMessage<T = unknown> {
  channel: string;
  payload: T;
}

interface MessageHistory<T = unknown> {
  messages: {
    timestamp: number;
    payload: T;
  }[];
  nextCursor?: string;
}

/**
 * Represents the interface for managing the WebSocket connection
 * and routing messages to channel handlers.
 */
export interface ConnectionManager {
  /**
   * Current state of the connection
   */
  readonly state: ConnectionState;

  /**
   * Get the identity associated with the current connection (if authenticated).
   */
  readonly identity: string | null;

  /**
   * Connect to the WebSocket server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void;

  /**
   * Subscribe to messages on a specific channel path
   */
  subscribe<T = unknown>(channelPath: string, handler: ChannelHandler<T>): Unsubscribe;

  /**
   * Find a matching authorized channel from static path and parameters
   * Returns the matching channel if found, or null if no match
   */
  resolveChannel(
    staticPath: string,
    params: Record<string, string | number | boolean>,
  ): string | null;

  /**
   * Subscribe to state changes
   */
  onStateChange?(fn: ((state: ConnectionState) => void) | null): void;

  /**
   * Send a presence update for a channel.
   */
  setPresence(channel: string, data: unknown): void;

  /**
   * Request the full presence state for a channel.
   */
  getPresence(channel: string): void;

  /**
   * Subscribe to full presence state updates for a channel.
   */
  subscribePresenceState(
    channel: string,
    handler: (state: Record<string, unknown>) => void,
  ): Unsubscribe;

  /**
   * Subscribe to incremental presence updates (joins, leaves, updates) for a channel.
   */
  subscribePresenceUpdate(
    channel: string,
    handler: (updates: Record<string, unknown>, removals: string[]) => void,
  ): Unsubscribe;

  /**
   * Get the history of messages for a channel.
   */
  getChannelHistory?(
    channel: string,
    options: { limit?: number; cursor?: string },
  ): Promise<MessageHistory>;
}

// Helper function to safely stringify JSON (moved out of class)
function safeStringify(data: unknown, fallback = '{}'): string {
  try {
    return JSON.stringify(data);
  } catch (e) {
    console.error('[[removed]ConnectionManager] Failed to stringify data:', e);
    return fallback;
  }
}

/**
 * Implementation of the ConnectionManager for [removed]
 */
export class [removed]ConnectionManager implements ConnectionManager {
  private ws: WebSocket | null = null;
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private subscriptions: Map<string, Set<ChannelHandler<any>>> = new Map();
  private config: ConnectionConfig;
  private authResponse: AuthResponse | null = null;
  private _selfIdentity: string | null = null;
  private channelTemplates: Map<string, ParsedChannel[]> = new Map();
  private onStateChangeFn: ((state: ConnectionState) => void) | null = null;
  private _didConnect = false;

  // --- Presence Subscriptions ---
  #presenceStateSubscriptions = new Map<string, Set<(state: Record<string, unknown>) => void>>();
  #presenceUpdateSubscriptions = new Map<
    string,
    Set<(updates: Record<string, unknown>, removals: string[]) => void>
  >();
  // ---------------------------

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  /**
   * Get the current connection state
   */
  get state(): ConnectionState {
    return this._state;
  }

  /**
   * Get the identity associated with the current connection (if authenticated).
   */
  get identity(): string | null {
    return this._selfIdentity;
  }

  /**
   * Set the connection state
   */
  private setState(state: ConnectionState): void {
    this._state = state;
    this.onStateChangeFn?.(state);
  }

  /**
   * Connect to the WebSocket server
   * This will first authenticate with the backend to get a token
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED) {
      return;
    }

    this.setState(this._didConnect ? ConnectionState.RECONNECTING : ConnectionState.CONNECTING);

    try {
      // Step 1: Authenticate with the backend
      const authResponse = await this.authenticate();
      this.authResponse = authResponse;
      this._selfIdentity = authResponse.identity ?? null;

      // Step 2: Build channel mappings from authorized channels
      this.buildChannelMappings(authResponse.channels);

      // Step 3: Connect to the WebSocket using the token
      await this.establishWebSocketConnection(authResponse);

      this.setState(ConnectionState.CONNECTED);
      this._didConnect = true;
    } catch (error) {
      this.setState(ConnectionState.ERROR);
      throw error;
    }
  }

  /**
   * Authenticate with the backend to get a token
   */
  private async authenticate(): Promise<AuthResponse> {
    const endpoint = this.config.endpoint;

    const response = await fetch(`${endpoint}/authenticate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as AuthResponse;
  }

  async getChannelHistory(
    channel: string,
    options: { limit?: number; cursor?: string },
  ): Promise<MessageHistory> {
    const endpoint = this.config.endpoint;

    const response = await fetch(`${endpoint}/${channel}/history`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
    });

    const json = await response.json();
    // parse inner payloads
    const messages = json.messages.map((message: any) => ({
      ...message,
      payload: SuperJSON.parse(message.payload),
    }));

    const parsed = {
      ...json,
      messages,
    };

    return parsed as MessageHistory;
  }

  /**
   * Build mappings from channel strings with metadata
   * Format: channelPath##paramName.value##paramName2.value2
   */
  private buildChannelMappings(authorizedChannels: string[]): void {
    this.channelTemplates.clear();

    for (const channelData of authorizedChannels) {
      // Parse the channel string with metadata
      const parsed = this.parseChannelWithMetadata(channelData);

      // Store by static path for efficient lookup
      if (!this.channelTemplates.has(parsed.staticPath)) {
        this.channelTemplates.set(parsed.staticPath, []);
      }

      const templates = this.channelTemplates.get(parsed.staticPath);
      if (templates) {
        templates.push(parsed);
      }
    }

    console.debug(`Built channel mappings for ${this.channelTemplates.size} static paths`);
  }

  /**
   * Parse a channel string with embedded parameter metadata
   * Format: path.value##paramName
   * Examples:
   * - user.123##userId
   * - chat.room-abc##roomId.user-123##userId
   * - version.1.2.3##semver
   */
  private parseChannelWithMetadata(channelString: string): ParsedChannel {
    console.log('Parsing channel:', channelString);

    // Initialize result with defaults
    const result: ParsedChannel = {
      channel: channelString,
      template: '',
      staticPath: '',
      params: {},
    };

    // If no "##" separator, this is a static channel
    if (!channelString.includes('##')) {
      result.template = channelString;
      result.staticPath = channelString;
      return result;
    }

    // Split the raw channel on dots to get segments
    const segments = channelString.split('.');

    // Create arrays to track which segments are static vs params
    const templateSegments: string[] = [];
    const staticSegments: string[] = [];

    // Process each segment
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i] || '';

      // Check if this segment contains a parameter marker
      if (segment.includes('##')) {
        // Split the segment to separate value from parameter name
        const parts = segment.split('##');
        const paramValue = parts[0] || '';
        const paramMetadata = parts[1] || '';

        // Extract the parameter name (before any dots)
        const paramName = paramMetadata.split('.')[0] || '';

        if (paramName) {
          // Store the parameter
          result.params[paramName] = paramValue;

          // Add the parameter placeholder to the template
          templateSegments.push(`{${paramName}}`);

          // Parameters aren't included in static path
        } else {
          // If somehow the format is invalid, treat as static
          templateSegments.push(segment);
          staticSegments.push(segment);
        }
      } else {
        // This is a static segment
        templateSegments.push(segment);
        staticSegments.push(segment);
      }
    }

    // Join segments to form template and static path
    result.template = templateSegments.join('.');
    result.staticPath = staticSegments.join('.');

    // If static path is empty, use first segment or fallback
    if (!result.staticPath && segments.length > 0) {
      // Find the first non-empty segment that doesn't contain ##
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i] || '';
        if (segment && !segment.includes('##')) {
          result.staticPath = segment;
          break;
        }
      }

      // If still no static path, use first segment or fallback
      if (!result.staticPath) {
        const firstSegment = segments[0] || '';
        // Extract before ## if present
        result.staticPath = firstSegment.split('##')[0] || 'channel';
      }
    }

    console.log('Parsed channel:', result);
    return result;
  }

  /**
   * Generate a template and static path from a channel and its parameters
   */
  private generateTemplateFromChannel(
    channel: string,
    params: Record<string, string>,
  ): { template: string; staticPath: string } {
    // Simple case: no parameters
    if (Object.keys(params).length === 0) {
      return { template: channel, staticPath: channel };
    }

    const segments = channel.split('.');
    const templateSegments: string[] = [];
    const staticSegments: string[] = [];

    // Map parameter values to their positions in the channel string
    const paramPositions: Record<string, number[]> = {};

    // Find where each parameter value appears in the channel
    for (const [paramName, paramValue] of Object.entries(params)) {
      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        // Skip if segment is undefined
        if (!segment) continue;

        if (segment === paramValue) {
          if (!paramPositions[paramName]) {
            paramPositions[paramName] = [];
          }
          paramPositions[paramName].push(i);
        }
      }
    }

    // Build template by replacing parameter values with placeholders
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      // Skip undefined segments
      if (!segment) continue;

      // Check if this segment position is a parameter
      let isParam = false;
      let paramName = '';

      for (const [name, positions] of Object.entries(paramPositions)) {
        if (positions && positions.includes(i)) {
          isParam = true;
          paramName = name;
          break;
        }
      }

      if (isParam) {
        templateSegments.push(`{${paramName}}`);
        // Don't include parameters in static path
      } else {
        templateSegments.push(segment);
        staticSegments.push(segment);
      }
    }

    // When static path is empty (all segments are parameters), use the first segment as a fallback
    if (staticSegments.length === 0 && segments.length > 0) {
      return {
        template: templateSegments.join('.'),
        staticPath: segments[0] || '',
      };
    }

    return {
      template: templateSegments.join('.'),
      staticPath: staticSegments.join('.'),
    };
  }

  /**
   * Find matching channel by comparing static path and parameters
   */
  resolveChannel(
    staticPath: string,
    params: Record<string, string | number | boolean>,
  ): string | null {
    // Convert all parameters to strings for comparison
    const stringParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      stringParams[key] = String(value);
    }

    // Look for exact static path match
    const templates = this.channelTemplates.get(staticPath);

    if (!templates || templates.length === 0) {
      console.warn(`No authorized channels found for static path: ${staticPath}`);

      // Try looking for the static path as a prefix
      for (const [candidatePath, candidateTemplates] of this.channelTemplates.entries()) {
        if (staticPath.startsWith(candidatePath) || candidatePath.startsWith(staticPath)) {
          console.log(`Found potential match using path prefix: ${candidatePath}`);

          // Check templates under this candidate path
          for (const template of candidateTemplates) {
            console.log(`Checking candidate template: ${template.channel}`);

            // For a match to succeed:
            // 1. All template params must be provided with the right values
            // 2. No extra parameters should be provided (exact match)
            if (this.exactParamMatch(template.params, stringParams)) {
              console.log(`Found matching channel: ${template.channel}`);
              return template.channel;
            }
          }
        }
      }

      return null;
    }

    // Find the template that matches the provided parameters exactly
    for (const parsed of templates) {
      // For a match to succeed:
      // 1. All template params must be provided with the right values
      // 2. No extra parameters should be provided (exact match)
      if (this.exactParamMatch(parsed.params, stringParams)) {
        return parsed.channel;
      }
    }

    // No match found
    console.warn(`No matching channel found for ${staticPath} with params:`, stringParams);
    return null;
  }

  /**
   * Checks if the provided parameters exactly match the template parameters.
   *
   * For a match to be successful:
   * 1. The parameter sets must have the same keys (no missing, no extras)
   * 2. The parameter values must match exactly
   */
  private exactParamMatch(
    templateParams: Record<string, string>,
    userParams: Record<string, string>,
  ): boolean {
    const templateKeys = Object.keys(templateParams);
    const userKeys = Object.keys(userParams);

    // Check key count - must be an exact match
    if (templateKeys.length !== userKeys.length) {
      console.warn(
        `Parameter count mismatch: template has ${templateKeys.length}, user provided ${userKeys.length}`,
      );
      return false;
    }

    // If both are empty, it's a match
    if (templateKeys.length === 0 && userKeys.length === 0) {
      return true;
    }

    // Check if user provided all template parameters with matching values
    for (const [paramName, expectedValue] of Object.entries(templateParams)) {
      // If parameter is missing
      if (!(paramName in userParams)) {
        console.warn(`Missing required parameter: ${paramName}`);
        return false;
      }

      // Get the user-provided value and convert dots to (dot) if needed
      let userValue = userParams[paramName];

      // Convert dots in user values to (dot) format to match channel format
      if (userValue) {
        userValue = userValue.replace(/\./g, '(dot)');
      } else {
        userValue = '';
      }

      // If parameter value doesn't match
      if (userValue !== expectedValue) {
        console.warn(
          `Parameter mismatch: ${paramName} expected ${expectedValue} but got ${userValue}`,
        );
        return false;
      }
    }

    // Check if user provided any extra parameters
    for (const paramName of userKeys) {
      if (!(paramName in templateParams)) {
        console.warn(`Extra parameter provided: ${paramName}`);
        return false;
      }
    }

    // All checks passed
    return true;
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._selfIdentity = null;
    this.setState(ConnectionState.DISCONNECTED);
  }

  /**
   * Subscribe to messages on a specific channel path
   */
  subscribe<T = unknown>(channelPath: string, handler: ChannelHandler<T>): Unsubscribe {
    if (!this.subscriptions.has(channelPath)) {
      this.subscriptions.set(channelPath, new Set());
    }
    const handlers = this.subscriptions.get(channelPath);
    if (handlers) {
      handlers.add(handler);
    }

    // Return unsubscribe function
    return () => {
      const handlers = this.subscriptions.get(channelPath);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscriptions.delete(channelPath);
        }
      }
    };
  }

  /**
   * Establish WebSocket connection
   */
  private async establishWebSocketConnection(authResponse: AuthResponse): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(authResponse.endpoint);

      ws.onopen = () => {
        this.ws = ws;

        if (process.env.NODE_ENV === 'development') {
          // @ts-ignore
          window.__ws = ws;
        }

        resolve();
      };

      ws.onclose = () => {
        this.setState(ConnectionState.DISCONNECTED);
        this.ws = null;
      };

      ws.onerror = (event) => {
        if (this.state === ConnectionState.CONNECTING) {
          reject(new Error('Failed to establish WebSocket connection'));
        }
        this.setState(ConnectionState.ERROR);
      };

      ws.onmessage = (event) => {
        try {
          const message: any = JSON.parse(event.data);

          // Runtime check for presence state message
          if (
            message &&
            typeof message === 'object' &&
            message.event === 'presenceState' &&
            typeof message.channel === 'string' &&
            message.state &&
            typeof message.state === 'object'
          ) {
            const handlers = this.#presenceStateSubscriptions.get(message.channel);
            handlers?.forEach((handler) => {
              try {
                // Pass the state object directly
                handler(message.state as Record<string, unknown>);
              } catch (error) {
                console.error(
                  `[[removed]ConnectionManager] Error in presenceState handler for channel "${message.channel}":`,
                  error,
                );
              }
            });
          }
          // Runtime check for presence update message
          else if (
            message &&
            typeof message === 'object' &&
            message.event === 'presenceUpdate' &&
            typeof message.channel === 'string' &&
            message.updates &&
            typeof message.updates === 'object' &&
            message.removals &&
            Array.isArray(message.removals)
          ) {
            const handlers = this.#presenceUpdateSubscriptions.get(message.channel);
            handlers?.forEach((handler) => {
              try {
                // Pass updates and removals
                handler(message.updates as Record<string, unknown>, message.removals as string[]);
              } catch (error) {
                console.error(
                  `[[removed]ConnectionManager] Error in presenceUpdate handler for channel "${message.channel}":`,
                  error,
                );
              }
            });
          } else if (typeof message === 'object' && message.event === 'welcome') {
            return;
          }
          // Otherwise, assume standard channel message
          else {
            this.routeMessage(message as IncomingMessage);
          }
        } catch (error) {
          console.error(
            '[[removed]ConnectionManager] Failed to parse or route message',
            error,
            'Raw data:',
            event.data,
          );
        }
      };
    });
  }

  /**
   * Route an incoming message to the appropriate handlers
   */
  private routeMessage<T>(message: IncomingMessage<T>): void {
    const { channel, payload } = message;
    const handlers = this.subscriptions.get(channel);

    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(SuperJSON.parse(payload as string));
        } catch (error) {
          console.error(`Error in handler for channel "${channel}":`, error);
        }
      });
    }
  }

  /**
   * Set the onStateChange function
   */
  onStateChange(fn: ((state: ConnectionState) => void) | null): void {
    this.onStateChangeFn = fn;
  }

  /**
   * Send a presence update for the given channel.
   */
  setPresence(channel: string, data: unknown): void {
    if (this.state !== ConnectionState.CONNECTED || !this.ws) {
      console.warn('[[removed]ConnectionManager] Cannot setPresence, not connected.');
      return;
    }

    if (typeof data === 'object' && data !== null && Object.keys(data).length === 0) {
      return;
    }

    const message = {
      event: 'setPresence',
      channel,
      data,
    };
    console.debug(`[[removed]ConnectionManager] Sending setPresence for ${channel}`);
    this.ws.send(safeStringify(message));
  }

  /**
   * Request the full presence state for the given channel.
   */
  getPresence(channel: string): void {
    if (this.state !== ConnectionState.CONNECTED || !this.ws) {
      console.warn('[[removed]ConnectionManager] Cannot getPresence, not connected.');
      return;
    }
    const message = {
      event: 'getPresence',
      channel,
    };
    console.debug(`[[removed]ConnectionManager] Sending getPresence for ${channel}`);
    this.ws.send(safeStringify(message));
  }

  /**
   * Subscribe to full presence state updates for a channel.
   */
  subscribePresenceState(
    channel: string,
    handler: (state: Record<string, unknown>) => void,
  ): Unsubscribe {
    if (!this.#presenceStateSubscriptions.has(channel)) {
      this.#presenceStateSubscriptions.set(channel, new Set());
    }
    const handlers = this.#presenceStateSubscriptions.get(channel);
    handlers?.add(handler);

    return () => {
      const handlers = this.#presenceStateSubscriptions.get(channel);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.#presenceStateSubscriptions.delete(channel);
        }
      }
    };
  }

  /**
   * Subscribe to incremental presence updates (joins, leaves, updates) for a channel.
   */
  subscribePresenceUpdate(
    channel: string,
    handler: (updates: Record<string, unknown>, removals: string[]) => void,
  ): Unsubscribe {
    if (!this.#presenceUpdateSubscriptions.has(channel)) {
      this.#presenceUpdateSubscriptions.set(channel, new Set());
    }
    const handlers = this.#presenceUpdateSubscriptions.get(channel);
    handlers?.add(handler);

    return () => {
      const handlers = this.#presenceUpdateSubscriptions.get(channel);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.#presenceUpdateSubscriptions.delete(channel);
        }
      }
    };
  }
}

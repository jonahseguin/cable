import { type ChannelConfig, type ChannelSchemaObject, type ChannelTreeDefinition } from '@/common';
import { defineChannels } from './channels';
import { createHmac } from 'crypto';
import { KEY } from '../internal';
import jwt from 'jsonwebtoken';
import Iron from '@hapi/iron';
import type { z } from 'zod';
import SuperJSON from 'superjson';
import './guard';
interface CreateOptions {
  apiKey: string;
  __baseUrl?: string;
  __baseWebSocketUrl?: string;
}

export type [removed]Container = ReturnType<typeof create>;

export function create(options: CreateOptions) {
  const { apiKey, __baseUrl, __baseWebSocketUrl } = options;
  const apiBaseUrl = __baseUrl ?? 'https://api.[removed].com';
  const baseWebSocketUrl = __baseWebSocketUrl ?? 'wss://api.[removed].com/connect';

  // Internal function to make authenticated API requests
  async function _makeApiRequest(endpoint: string, body: any, method: 'POST' | 'GET' = 'POST') {
    console.debug(
      `[API Request] Endpoint: ${apiBaseUrl}${endpoint}, Key: ${apiKey ? `[removed]_******${apiKey.slice(-6)}` : 'NONE'}`,
      {
        body,
      },
    );

    const searchParams = new URLSearchParams(
      Object.fromEntries(
        Object.entries(body).filter(([_, value]) => value !== undefined) as [string, string][],
      ),
    );
    const searchParamsString = method === 'GET' ? `?${searchParams.toString()}` : '';

    const response = await fetch(`${apiBaseUrl}${endpoint}${searchParamsString}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.debug(`[API Response]`, data);

    return data;
  }

  async function instanceEmitLogic(
    channelPath: string,
    payload: any,
    options?: { persist?: boolean },
  ) {
    await _makeApiRequest('/publish', {
      channel: channelPath,
      payload: SuperJSON.stringify(payload),
      ...(options?.persist && { persist: true }),
    });
  }

  async function getChannelHistory(
    channel: string,
    options: { limit?: number; cursor?: string } = {},
  ) {
    const response = await _makeApiRequest(
      `/history/${channel}`,
      {
        limit: options.limit,
        cursor: options.cursor,
      },
      'GET',
    );
    return response;
  }

  // Function provided to the user to define channels within the API key context
  function useChannels<Config extends ChannelTreeDefinition>(config: Config) {
    // Pass the instance-specific emitLogic to defineChannels
    return defineChannels(config, instanceEmitLogic);
  }

  function richChannel<
    InputSchema extends z.ZodTypeAny,
    OutputType,
    const Config extends ChannelConfig,
    PresenceSchema extends z.ZodTypeAny,
  >({
    schema,
    capabilities,
    transform,
    onEmit,
  }: {
    schema: InputSchema;
    capabilities?: Config & { history?: boolean; presence?: PresenceSchema };
    transform?: (payload: z.infer<InputSchema>) => Promise<OutputType>;
    onEmit?: (payload: OutputType) => Promise<void>;
  }) {
    return {
      schema,
      capabilities,
      transform,
      onEmit,
    } as ChannelSchemaObject<InputSchema, OutputType, Config>;
  }

  async function createConnectionToken(params: {
    identifier: string;
    authorizedChannels: string[];
    ipAddress?: string;
    userAgent?: string;
    origin?: string;
  }) {
    const entity = createHmac('sha256', KEY).update(apiKey).digest('hex');
    const token = jwt.sign({ entity, ...params }, apiKey, { expiresIn: '1h' });
    const sealed = await Iron.seal(token, KEY, Iron.defaults);
    return sealed;
  }

  Object.assign(useChannels, {
    rich: richChannel,
  });

  return {
    channels: useChannels as typeof useChannels & {
      rich: typeof richChannel;
    },
    __createConnectionToken: createConnectionToken,
    __getChannelHistory: getChannelHistory,
    __options: {
      __baseWebSocketUrl: baseWebSocketUrl,
      __apiBaseUrl: apiBaseUrl,
    },
  };
}

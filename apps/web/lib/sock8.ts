import { initSock8 } from '@sock8/sdk/server';
import { z } from 'zod';

export const sock8 = initSock8.create({
  apiKey: 'sock8_IILviHGsz4QNz27tIqqynjE0x3ruITVv',
  __baseWebSocketUrl:
    process.env.NODE_ENV === 'development' ? 'ws://localhost:8080/connect' : undefined,
  __baseUrl: process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : undefined,
});

export const channels = sock8.channels({
  'chat.global.msgs': sock8.channels.rich({
    schema: z.object({
      message: z.string(),
      timestamp: z.number(),
      sender: z.string(),
      senderId: z.string(),
    }),
    transform: async (message) => {
      return {
        ...message,
        timestamp: new Date(message.timestamp),
      };
    },
    onEmit: async (message) => {
      // insert into db
    },
    capabilities: {
      history: true,
      presence: z.object({
        online: z.boolean(),
        name: z.string(),
        identity: z.string(),
        avatar: z.string(),
        typing: z.boolean(),
        cursor: z.object({
          x: z.number(),
          y: z.number(),
        }),
        color: z.string(),
      }),
    },
  }),
});

export type AppChannels = typeof channels;

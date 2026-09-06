import type { ChannelEndpoint, ChannelTree, ChannelTreeDefinition } from '@sock8/sdk/dsl';
import { getChannelIdentifier, type Sock8Container } from '@sock8/sdk/server';
import { z } from 'zod';

type NextRequest = Request;
type NextResponse = Response;
type NextJsHandler = (req: NextRequest) => Promise<NextResponse>;

type Connection = {
  grant: (channel: ChannelEndpoint<ChannelTree<ChannelTreeDefinition>>) => void;
  identifyAs: (id: string) => void;
  identifier: string;
};

type NextJsHandlerParams = {
  authorize: (connection: Connection) => Promise<void>;
};

export function withSock8(
  container: Sock8Container,
  { authorize }: NextJsHandlerParams,
): { GET: NextJsHandler; POST: NextJsHandler } {
  const handler = async (req: NextRequest): Promise<NextResponse> => {
    const url = new URL(req.url);
    const path = url.pathname;

    const authorizedChannels: string[] = [];
    let identifier = crypto.randomUUID() as string;
    const connection = {
      grant: (channel: ChannelEndpoint<ChannelTree<ChannelTreeDefinition>>) => {
        authorizedChannels.push(getChannelIdentifier(channel));
      },
      identifyAs: (id: string) => {
        identifier = id;
      },
      identifier,
    };

    await authorize(connection);

    if (path === '/api/channels/authenticate' && req.method === 'POST') {
      return await handleAuthenticate(req, identifier, authorizedChannels, container);
    }

    if (path.startsWith('/api/channels/') && path.endsWith('/history') && req.method === 'GET') {
      const channel = path.split('/')[3];

      if (channel && authorizedChannels.includes(channel)) {
        return await handleChannelHistory(req, channel, container);
      }

      return new Response('Unauthorized', {
        status: 401,
      });
    }

    return new Response('Not found', {
      status: 404,
    });
  };

  return { GET: handler, POST: handler };
}

async function handleChannelHistory(
  req: NextRequest,
  channel: string,
  container: Sock8Container,
): Promise<NextResponse> {
  const { limit, cursor } = z
    .object({
      limit: z.coerce.number().min(1).max(100).optional().default(50),
      cursor: z.string().optional(),
    })
    .parse(Object.fromEntries(new URL(req.url).searchParams));

  const history = await container.__getChannelHistory(channel, { limit, cursor });

  return new Response(JSON.stringify(history), {
    status: 200,
  });
}

async function handleAuthenticate(
  req: NextRequest,
  identifier: string,
  authorizedChannels: string[],
  container: Sock8Container,
) {
  // if channels is empty, we don't need to create a connection
  // we should treat this as an authentication error
  if (authorizedChannels.length === 0) {
    return new Response('Unauthorized', {
      status: 401,
    });
  }

  const token = await container.__createConnectionToken({
    identifier,
    authorizedChannels,
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
    origin: req.headers.get('origin') ?? undefined,
  });

  return new Response(
    // todo: we should share some types between the client and server for this via sdk/common
    JSON.stringify({
      endpoint: `${container.__options.__baseWebSocketUrl}/${encodeURIComponent(token)}`,
      channels: authorizedChannels,
      identity: identifier,
    }),
    {
      status: 200,
    },
  );
}

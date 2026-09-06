# Sock8 WebSocket Service [api]

A modern, scalable WebSocket service built on Cloudflare Workers and Durable Objects. Provides real-time messaging across global edge regions.

## Features

- **Global Edge Distribution**: Connects users to the nearest edge location
- **Horizontal Scaling**: Uses consistent hashing to distribute connections across shards
- **Channel-based Messaging**: Supports pub/sub messaging to channels
- **Regional Routing**: Efficiently routes messages only to active regions

## Architecture

The service uses several Cloudflare technologies:

- **Workers**: Handles HTTP requests and WebSocket upgrades
- **Durable Objects**: Maintains WebSocket connections and channel state
- **KV Storage**: Tracks active regions and connection metadata

### Components

- **ChannelRouter**: Routes messages to appropriate shards using consistent hashing
- **SocketShard**: Manages WebSocket connections and handles message delivery
- **Connection Handler**: Handles WebSocket upgrades and shard assignment
- **Publish API**: Distributes messages to connected clients across regions

## Development

### Prerequisites

- [Bun](https://bun.sh) or Node.js 18+
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) CLI

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   bun install
   ```
3. Copy environment variables:
   ```
   cp .example.dev.vars .dev.vars
   ```
4. Start the development server:
   ```
   bun run dev
   ```

### Testing

Use the included test script to verify functionality:

```bash
./test.sh
```

This will:

1. Connect a WebSocket client to the service
2. Publish a message to a channel
3. Verify the message is received by the client

## Deployment

Deploy to Cloudflare Workers:

```bash
bun run deploy
```

## Environment Variables

Configure the following environment variables:

| Variable          | Description                          | Required |
| ----------------- | ------------------------------------ | -------- |
| DATABASE_HOST     | Database hostname                    | Yes      |
| DATABASE_USERNAME | Database username                    | Yes      |
| DATABASE_PASSWORD | Database password                    | Yes      |
| DATABASE_NAME     | Database name                        | Yes      |
| DATABASE_URL      | Full database connection URL         | Yes      |
| NODE_ENV          | Environment (development/production) | No       |

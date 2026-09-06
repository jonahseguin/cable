# [removed]

[[removed].com](https://www.[removed].com)

_WebSockets that don't suck._

[removed] provides WebSockets-as-a-Service with end-to-end type-safe APIs and SDKs, edge-native functionality, infinite scale and transparent pricing.

## Project Structure

This is a Turborepo monorepo.

**Apps:**

- `web`: Next.js full-stack web application
- `worker`: Cloudflare Worker for WebSocket connectivity and functionality + API
- `docs`: Developer documentation for SDK/API usage

**Packages:**

- `db`: drizzle schema for database models and migrations
- `ui`: shared UI components, mostly shadcn/ui
- `eslint-config`: shared ESLint configs
- `typescript-config`: shared TypeScript configs

## Getting Started

### Prerequisites

- Node.js 20+
- Bun 1.2.0+

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```
   This will automatically set up Git hooks for code formatting.

## Infrastructure Stack

- Web hosting: Vercel
- Database: PlanetScale (Serverless MySQL)
- WebSockets: Cloudflare
- Payments: Stripe

## Tech Stack

- Next.js
- TypeScript
- ESLint + Prettier
- Drizzle
- shadcn/ui
- TailwindCSS
- Better-Auth

## Goals and Values

1. **Great DX** via well-thought and purposeful SDKs and APIs.
2. _Transparent_ and reasonable pricing; **free to try**; Enterprise is stupid.
3. Abstractions are opt-in; the core functionality of pub/sub should remain the bare-minimum and be **simple to use**, but be **easy to build upon**.
4. **Excellent observability**.
5. End-to-end **type-safety**.
6. End-users (developers) have the flexibility to **create their own abstractions** on top of our core primitives.
7. _Everything is an API_.
8. Real-time and collaboration are **defaults**.

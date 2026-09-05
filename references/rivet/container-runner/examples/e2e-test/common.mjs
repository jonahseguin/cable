// Shared constants for the e2e scripts. Override via env when needed.
export const ENGINE = process.env.ENGINE_URL || "http://127.0.0.1:6420";
export const ENGINE_PUBLIC = process.env.ENGINE_PUBLIC_URL || ENGINE;
export const NAMESPACE = process.env.RIVET_NAMESPACE || "default";
export const TOKEN = process.env.RIVET_TOKEN || "admin";
export const DATACENTER = process.env.RIVET_DATACENTER || "default";
export const RUNNER_NAME = process.env.RIVET_RUNNER_NAME || "game";
export const ACTOR_NAME = process.env.RIVET_ACTOR_NAME || "game";
// Where the engine (on the compose network) reaches the game container's front door.
export const SERVERLESS_URL =
  process.env.SERVERLESS_URL || "http://game:8080/api/rivet";

export function actorGatewayPath(actorId, path = "/") {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `/gateway/${encodeURIComponent(actorId)}${suffix}`;
}

export function actorGatewayHttpUrl(actorId, path = "/") {
  return `${ENGINE_PUBLIC.replace(/\/$/, "")}${actorGatewayPath(actorId, path)}`;
}

export function actorGatewayWsUrl(actorId, path = "/") {
  return actorGatewayHttpUrl(actorId, path).replace(/^http/i, "ws");
}

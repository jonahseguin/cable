import { CableError } from "./errors.js";
import type { GrantClaims, HostKey, SignedGrant } from "./host.js";
/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters,
anti-slop/no-unsafe-dictionary-type -- Grant JSON is an authenticated trust
boundary. The verifier authenticates its bytes before these parsers narrow it. */
import { assertJsonData } from "./rpc.js";

const GRANT_DOMAIN = "cable.grant.v1.";
const HMAC_BYTES = 32;
const MIN_SECRET_BYTES = 32;

/** A Web Crypto HMAC key or at least 32 bytes of secret key material. */
export type GrantSecret = CryptoKey | Uint8Array<ArrayBuffer> | string;

/** The reason an authenticated upgrade grant was rejected. */
export type GrantErrorReason = "expired" | "invalid" | "wrong-host";

/** Data carried by grant verification failures. */
export interface GrantErrorData {
  readonly reason: GrantErrorReason;
}

/** Verified claims whose channel parameters are ready for canonical key checks. */
export type VerifiedGrantClaims = GrantClaims<unknown, Readonly<Record<string, string>>>;

/**
 * Serialize and sign short-lived channel claims with HMAC-SHA256.
 *
 * `exp` is an absolute Unix timestamp in milliseconds. The payload preserves
 * the JSON bytes produced here; verification never reserializes them.
 */
export async function signGrant(claims: GrantClaims, secret: GrantSecret): Promise<SignedGrant> {
  const normalized = normalizeClaims(claims);
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(normalized)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await prepareKey(secret, "sign"),
    grantMessage(payload),
  );
  return Object.freeze({ payload, sig: encodeBase64Url(new Uint8Array(signature)) });
}

/**
 * Authenticate and parse a grant bound to `expectedHostKey`.
 *
 * The signature covers the ASCII domain prefix and literal base64url payload.
 * Invalid signatures are rejected before payload bytes are decoded as JSON.
 */
export async function verifyGrant(
  grant: SignedGrant,
  secret: GrantSecret,
  expectedHostKey: HostKey,
  now: number,
): Promise<VerifiedGrantClaims> {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new TypeError("now must be a non-negative Unix timestamp in milliseconds");
  }
  if (typeof grant.payload !== "string" || typeof grant.sig !== "string") {
    throw invalidGrant("invalid");
  }

  let signature: Uint8Array<ArrayBuffer>;
  try {
    signature = decodeBase64Url(grant.sig);
  } catch (cause) {
    throw invalidGrant("invalid", cause);
  }
  if (signature.byteLength !== HMAC_BYTES) {
    throw invalidGrant("invalid");
  }

  let authenticated: boolean;
  try {
    authenticated = await crypto.subtle.verify(
      "HMAC",
      await prepareKey(secret, "verify"),
      signature,
      grantMessage(grant.payload),
    );
  } catch (cause) {
    throw invalidGrant("invalid", cause);
  }
  if (!authenticated) {
    throw invalidGrant("invalid");
  }

  let claims: VerifiedGrantClaims;
  try {
    const payload = decodeUtf8(decodeBase64Url(grant.payload));
    const parsed: unknown = JSON.parse(payload);
    claims = parseClaims(parsed);
  } catch (cause) {
    throw invalidGrant("invalid", cause);
  }
  if (claims.hostKey !== expectedHostKey) {
    throw invalidGrant("wrong-host");
  }
  if (claims.exp <= now) {
    throw invalidGrant("expired");
  }
  return claims;
}

function normalizeClaims(claims: GrantClaims): VerifiedGrantClaims {
  assertJsonData(claims, "BAD_REQUEST");
  assertNoUndefined(claims);
  const parsed = parseClaims(claims);
  const normalized = {
    exp: parsed.exp,
    grants: parsed.grants,
    hostKey: parsed.hostKey,
    identity: parsed.identity,
    params: parsed.params,
    v: 1 as const,
  } satisfies VerifiedGrantClaims;
  return Object.freeze(parsed.uid === undefined ? normalized : { ...normalized, uid: parsed.uid });
}

function parseClaims(value: unknown): VerifiedGrantClaims {
  const claims = requireRecord(value);
  assertKeys(claims, ["exp", "grants", "hostKey", "identity", "params", "uid", "v"]);
  if (claims["v"] !== 1) throw new TypeError("Grant version must be 1");
  const exp = claims["exp"];
  if (typeof exp !== "number" || !Number.isSafeInteger(exp) || exp <= 0) {
    throw new TypeError("Grant expiry must be a positive Unix timestamp in milliseconds");
  }
  const hostKey = requireNonemptyString(claims["hostKey"], "Grant host key");
  const grants = requireStringArray(claims["grants"]);
  const params = requireStringRecord(claims["params"]);
  if (!Object.hasOwn(claims, "identity")) {
    throw new TypeError("Grant identity is required");
  }
  assertJsonData(claims["identity"], "BAD_REQUEST");
  const uid = requireOptionalNonemptyString(claims["uid"], "Grant uid");
  const result = {
    exp,
    grants,
    // SAFETY: HostKey is an opaque non-empty string; destination equality is checked after authentication.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Parsing establishes the string representation for the brand.
    hostKey: hostKey as HostKey,
    identity: claims["identity"],
    params,
    v: 1 as const,
  } satisfies VerifiedGrantClaims;
  return Object.freeze(uid === undefined ? result : { ...result, uid });
}

interface UnparsedGrant {
  readonly [key: string]: unknown;
}

function requireRecord(value: unknown): UnparsedGrant {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Grant payload must be an object");
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Grant payload must be a plain object");
  }
  // SAFETY: The value is a plain, non-null object whose fields remain unknown.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Frame-specific parsing follows immediately.
  return value as UnparsedGrant;
}

function assertKeys(value: UnparsedGrant, allowed: readonly string[]): void {
  const invalid = Object.keys(value).find((key) => !allowed.includes(key));
  if (invalid !== undefined) throw new TypeError(`Grant payload has unknown key '${invalid}'`);
}

function requireStringArray(value: unknown): readonly string[] {
  if (!isUnknownArray(value)) {
    throw new TypeError("Grant capabilities must be an array");
  }
  const grants: string[] = [];
  for (const grant of value) {
    if (typeof grant !== "string" || grant.length === 0) {
      throw new TypeError("Grant capabilities must be non-empty strings");
    }
    grants.push(grant);
  }
  if (new Set(grants).size !== grants.length) {
    throw new TypeError("Grant capabilities must not contain duplicates");
  }
  return Object.freeze(grants);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function requireStringRecord(value: unknown): Readonly<Record<string, string>> {
  const record = requireRecord(value);
  const params: Record<string, string> = {};
  for (const [name, parameter] of Object.entries(record)) {
    if (typeof parameter !== "string") {
      throw new TypeError(`Grant parameter '${name}' must be a string`);
    }
    params[name] = parameter;
  }
  return Object.freeze(params);
}

function requireNonemptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireOptionalNonemptyString(value: unknown, label: string): string | undefined {
  return value === undefined ? undefined : requireNonemptyString(value, label);
}

async function prepareKey(secret: GrantSecret, usage: "sign" | "verify"): Promise<CryptoKey> {
  if (typeof secret !== "string" && !(secret instanceof Uint8Array)) {
    if (secret.algorithm.name !== "HMAC" || !secret.usages.includes(usage)) {
      throw new TypeError(`Grant CryptoKey must allow HMAC ${usage}`);
    }
    return secret;
  }
  const bytes = typeof secret === "string" ? new TextEncoder().encode(secret) : secret;
  if (bytes.byteLength < MIN_SECRET_BYTES) {
    throw new TypeError("Grant secret must contain at least 32 bytes");
  }
  return crypto.subtle.importKey("raw", bytes, { hash: "SHA-256", name: "HMAC" }, false, [usage]);
}

function grantMessage(payload: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${GRANT_DOMAIN}${payload}`);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) {
    throw new TypeError("Grant value must use unpadded base64url");
  }
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/") + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (encodeBase64Url(bytes) !== value) {
    throw new TypeError("Grant value must use canonical base64url");
  }
  return bytes;
}

function decodeUtf8(value: Uint8Array<ArrayBuffer>): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(value);
}

function assertNoUndefined(value: unknown, path = "root"): void {
  if (value === undefined) {
    throw new CableError("BAD_REQUEST", { message: `Grant contains undefined at ${path}` });
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertNoUndefined(value[index], `${path}[${index}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assertNoUndefined(child, `${path}.${key}`);
  }
}

function invalidGrant(
  reason: GrantErrorReason,
  cause?: unknown,
): CableError<"UNAUTHORIZED", GrantErrorData> {
  return new CableError("UNAUTHORIZED", {
    cause,
    data: { reason },
    message: reason === "expired" ? "Grant expired" : "Invalid grant",
  });
}

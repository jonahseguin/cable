/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type --
Channel parameter names are declared dynamically by the contract pattern. This
module parses the schema's unknown input and output into that named string map. */
import { isChannelContract } from "@cable/contract";
import type { AnyChannelContract } from "@cable/contract";

import { CableError } from "./errors.js";
import type { HostKey } from "./host.js";
import { validate } from "./validation.js";

/** A validated channel route ready for authentication and host lookup. */
export interface ResolvedChannel {
  readonly key: HostKey;
  readonly params: Readonly<Record<string, string>>;
}

/**
 * Validate raw channel parameters once and derive their canonical host key.
 *
 * A custom parameter schema may transform its input, but its output must remain
 * an exact plain object whose pattern fields are strings.
 */
export async function resolveChannel(
  channel: AnyChannelContract,
  input: unknown,
): Promise<ResolvedChannel> {
  if (!isChannelContract(channel)) {
    throw new TypeError("channel must be a contract returned by c.channel");
  }
  const output = await validate(channel.params, input);
  const params = parseChannelParams(channel.paramNames, output);
  return Object.freeze({ key: channelKey(channel, params), params });
}

/**
 * Derive a host key from parameters that already passed `resolveChannel`.
 *
 * Every literal and parameter segment is encoded independently with RFC 3986
 * percent encoding, then joined with `:`. This keeps segment boundaries unique.
 */
export function channelKey(
  channel: AnyChannelContract,
  params: Readonly<Record<string, string>>,
): HostKey {
  if (!isChannelContract(channel)) {
    throw new TypeError("channel must be a contract returned by c.channel");
  }
  assertChannelParams(channel.paramNames, params);
  const segments = channel.pattern.split(".").map((segment) => {
    const match = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(segment);
    return encodeHostKeySegment(
      match === null ? segment : requireParam(params, requireCapture(match)),
    );
  });
  const key = segments.join(":");
  // SAFETY: Each channel segment was encoded separately before the unambiguous
  // separator was inserted, so this string is the canonical key for the route.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- HostKey is an opaque canonical-string brand.
  return key as HostKey;
}

/**
 * Recover pattern parameters from a canonical host key without running their
 * Standard Schema again.
 *
 * Malformed escapes, changed literal segments, and non-canonical encodings are
 * rejected. The returned strings are the schema outputs originally used to
 * derive the key.
 */
export function parseChannelKey(
  channel: AnyChannelContract,
  key: HostKey | string,
): Readonly<Record<string, string>> {
  if (!isChannelContract(channel)) {
    throw new TypeError("channel must be a contract returned by c.channel");
  }
  const patternSegments = channel.pattern.split(".");
  const keySegments = key.split(":");
  if (patternSegments.length !== keySegments.length) {
    throw invalidHostKey("Host key segment count does not match the channel pattern");
  }

  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const keySegment = keySegments[index];
    if (patternSegment === undefined || keySegment === undefined) {
      throw invalidHostKey("Host key segment count does not match the channel pattern");
    }
    const decoded = decodeHostKeySegment(keySegment);
    const match = /^\{([A-Za-z_][A-Za-z0-9_]*)\}$/.exec(patternSegment);
    if (match === null) {
      if (decoded !== patternSegment) {
        throw invalidHostKey("Host key literal does not match the channel pattern");
      }
      continue;
    }
    params[requireCapture(match)] = decoded;
  }
  assertChannelParams(channel.paramNames, params);
  return Object.freeze(params);
}

/** Encode one channel key segment using the RFC 3986 unreserved set. */
export function encodeHostKeySegment(segment: string): string {
  try {
    return encodeURIComponent(segment).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  } catch (cause) {
    throw new CableError("VALIDATION", {
      cause,
      data: { issues: [{ message: "Channel parameters must contain valid Unicode" }] },
    });
  }
}

function decodeHostKeySegment(segment: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch (cause) {
    throw new CableError("BAD_REQUEST", {
      cause,
      message: "Host key has invalid percent encoding",
    });
  }
  if (encodeHostKeySegment(decoded) !== segment) {
    throw invalidHostKey("Host key is not canonically encoded");
  }
  return decoded;
}

function parseChannelParams(
  paramNames: readonly string[],
  value: unknown,
): Readonly<Record<string, string>> {
  if (!isPlainRecord(value)) {
    throw invalidParams("Validated channel parameters must be a plain object");
  }
  assertChannelParams(paramNames, value);
  const params: Record<string, string> = {};
  for (const name of paramNames) {
    params[name] = requireParam(value, name);
  }
  return Object.freeze(params);
}

function assertChannelParams(
  paramNames: readonly string[],
  value: UnparsedParams,
): asserts value is Readonly<Record<string, string>> {
  const keys = Object.keys(value);
  if (keys.length !== paramNames.length || keys.some((key) => !paramNames.includes(key))) {
    throw invalidParams("Validated channel parameters must match the channel pattern exactly");
  }
  for (const name of paramNames) {
    if (typeof value[name] !== "string") {
      throw invalidParams(`Validated channel parameter '${name}' must be a string`);
    }
  }
}

interface UnparsedParams {
  readonly [name: string]: unknown;
}

function isPlainRecord(value: unknown): value is UnparsedParams {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireCapture(match: RegExpExecArray): string {
  const capture = match[1];
  if (capture === undefined) {
    throw new TypeError("Channel contract contains an invalid parameter segment");
  }
  return capture;
}

function requireParam(params: UnparsedParams, name: string): string {
  const value = params[name];
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- This establishes the channel's required parsed string-param invariant.
  if (typeof value !== "string") {
    throw invalidParams(`Validated channel parameter '${name}' must be a string`);
  }
  return value;
}

function invalidParams(message: string): CableError<"VALIDATION"> {
  return new CableError("VALIDATION", { data: { issues: [{ message }] } });
}

function invalidHostKey(message: string): CableError<"BAD_REQUEST"> {
  return new CableError("BAD_REQUEST", { message });
}

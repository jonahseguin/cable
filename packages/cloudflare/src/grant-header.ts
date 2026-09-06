import type { SignedGrant } from "@cable/core";

/** Serialize a signed grant for the private edge-to-host request header. */
export function encodeGrantHeader(grant: SignedGrant): string {
  return `${grant.payload}.${grant.sig}`;
}

/** Parse the private header without decoding or reserializing its signed payload. */
export function decodeGrantHeader(value: string | null): SignedGrant | undefined {
  if (value === null) return undefined;
  const separator = value.indexOf(".");
  if (separator <= 0 || separator !== value.lastIndexOf(".") || separator === value.length - 1) {
    return undefined;
  }
  return { payload: value.slice(0, separator), sig: value.slice(separator + 1) };
}

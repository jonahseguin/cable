import { describe, expect, it } from "vitest";

import { decodeGrantHeader, encodeGrantHeader } from "./grant-header.js";

describe("private grant header", () => {
  it("roundtrips the literal signed payload without reserialization", () => {
    const grant = { payload: "eyJ2IjoxfQ", sig: "signature_-" };
    expect(decodeGrantHeader(encodeGrantHeader(grant))).toEqual(grant);
  });

  it.each([null, "", ".signature", "payload.", "payload.signature.extra"])(
    "rejects malformed value %s",
    (value) => {
      expect(decodeGrantHeader(value)).toBeUndefined();
    },
  );
});

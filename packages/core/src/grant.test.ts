import { describe, expect, it } from "vitest";

import { signGrant, verifyGrant } from "./grant.js";
import type { GrantClaims, HostKey, SignedGrant } from "./host.js";

const secret = "0123456789abcdef0123456789abcdef";

function hostKey(value: string): HostKey {
  // SAFETY: Tests use this helper only for canonical host keys.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- HostKey is an opaque canonical-string brand.
  return value as HostKey;
}

function claims(exp: number): GrantClaims {
  return {
    exp,
    grants: ["room:read", "room:write"],
    hostKey: hostKey("chat:lobby"),
    identity: { role: "member", subject: "user-1" },
    params: { roomId: "lobby" },
    uid: "user-1",
    v: 1,
  };
}

describe("signed grants", () => {
  it("roundtrips authenticated claims and preserves exact payload bytes", async () => {
    const grant = await signGrant(claims(10_000), secret);
    const verified = await verifyGrant(grant, secret, hostKey("chat:lobby"), 9_000);

    expect(verified).toEqual(claims(10_000));
    expect(grant).toEqual({
      payload:
        "eyJleHAiOjEwMDAwLCJncmFudHMiOlsicm9vbTpyZWFkIiwicm9vbTp3cml0ZSJdLCJob3N0S2V5IjoiY2hhdDpsb2JieSIsImlkZW50aXR5Ijp7InJvbGUiOiJtZW1iZXIiLCJzdWJqZWN0IjoidXNlci0xIn0sInBhcmFtcyI6eyJyb29tSWQiOiJsb2JieSJ9LCJ2IjoxLCJ1aWQiOiJ1c2VyLTEifQ",
      sig: "DgKcKN3eJtqcwm_XnQbTMq2J1E-B83oP9KBCAmFELmo",
    });
  });

  it("rejects tampering, the wrong secret, and the wrong host", async () => {
    const grant = await signGrant(claims(10_000), secret);
    const tampered: SignedGrant = {
      payload: `${grant.payload.slice(0, -1)}${grant.payload.endsWith("A") ? "B" : "A"}`,
      sig: grant.sig,
    };

    await expect(verifyGrant(tampered, secret, hostKey("chat:lobby"), 9_000)).rejects.toMatchObject(
      { code: "UNAUTHORIZED", data: { reason: "invalid" } },
    );
    await expect(
      verifyGrant(grant, "fedcba9876543210fedcba9876543210", hostKey("chat:lobby"), 9_000),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", data: { reason: "invalid" } });
    await expect(verifyGrant(grant, secret, hostKey("chat:other"), 9_000)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      data: { reason: "wrong-host" },
    });
  });

  it("expires at the declared millisecond and validates signing inputs", async () => {
    const grant = await signGrant(claims(10_000), secret);

    await expect(verifyGrant(grant, secret, hostKey("chat:lobby"), 10_000)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      data: { reason: "expired" },
    });
    await expect(signGrant(claims(10_000), "too short")).rejects.toThrow("at least 32 bytes");
    await expect(
      signGrant({ ...claims(10_000), grants: ["duplicate", "duplicate"] }, secret),
    ).rejects.toThrow("must not contain duplicates");
    await expect(
      signGrant({ ...claims(10_000), identity: new Date(0) }, secret),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      signGrant({ ...claims(10_000), identity: { subject: undefined } }, secret),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(signGrant({ ...claims(10_000), params: { roomId: 1 } }, secret)).rejects.toThrow(
      "must be a string",
    );
  });
});

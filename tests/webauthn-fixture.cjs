/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * A software authenticator for the passkey regressions: it produces the same
 * `PublicKeyCredential` JSON a real authenticator returns, signed with a key this
 * module holds, so server-side WebAuthn verification is exercised for real.
 *
 * It is deliberately not a browser stand-in. Nothing here proves that a phone, a
 * security key, a synced passkey or a password manager behaves the same way — it only
 * proves that the server accepts a well-formed credential for the RP ID, origin and
 * challenge it expects, and refuses everything else.
 */
const {
  createSign, createHash, generateKeyPairSync, randomBytes,
} = require("node:crypto");

const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (text) =>
  Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const sha256 = (bytes) => createHash("sha256").update(Buffer.from(bytes)).digest();

const UP = 0x01, UV = 0x04, AT = 0x40;
const uint32 = (n) => Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
const uint16 = (n) => Buffer.from([(n >>> 8) & 0xff, n & 0xff]);

/** The slice of CBOR a COSE key and a `none` attestation object need. */
function cbor(value) {
  if (value === null || value === undefined) return Buffer.from([0xf6]);
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return head(2, value.length, Buffer.from(value));
  if (typeof value === "string") return head(3, Buffer.byteLength(value), Buffer.from(value, "utf8"));
  if (typeof value === "boolean") return Buffer.from([value ? 0xf5 : 0xf4]);
  if (Number.isInteger(value)) return value < 0 ? head(1, -1 - value, Buffer.alloc(0)) : head(0, value, Buffer.alloc(0));
  if (Array.isArray(value)) return head(4, value.length, Buffer.concat(value.map(cbor)));
  if (value instanceof Map) {
    return head(5, value.size, Buffer.concat([...value].flatMap(([key, item]) => [cbor(key), cbor(item)])));
  }
  throw new TypeError("Unsupported CBOR value: " + typeof value);
}
function head(major, argument, payload) {
  const base = major << 5;
  if (argument < 24) return Buffer.concat([Buffer.from([base | argument]), payload]);
  if (argument < 0x100) return Buffer.concat([Buffer.from([base | 24, argument]), payload]);
  if (argument < 0x10000) return Buffer.concat([Buffer.from([base | 25, argument >> 8, argument & 0xff]), payload]);
  return Buffer.concat([Buffer.from([base | 26, (argument >>> 24) & 0xff, (argument >>> 16) & 0xff, (argument >>> 8) & 0xff, argument & 0xff]), payload]);
}

/** P-256 public key as the COSE_Key WebAuthn stores (EC2, x9_62 prime256v1). */
const coseKey = (point) => cbor(new Map([
  [1, 2], [3, -7], [-1, 1],
  [-2, point.subarray(1, 33)],
  [-3, point.subarray(33, 65)],
]));

/**
 * One credential, one key pair. `userVerified: false` builds assertions without the UV
 * flag so the contract's refusal of them can be proven.
 */
function createAuthenticator({ rpId, origin, userVerified = true, aaguid = randomBytes(16) } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const der = publicKey.export({ type: "spki", format: "der" });
  const point = der.subarray(der.length - 65); // uncompressed 0x04 || x || y
  const credentialId = randomBytes(32);
  const rpIdHash = sha256(Buffer.from(rpId, "utf8"));
  let counter = 0;

  const sign = (authData, clientData) => b64url(
    createSign("sha256")
      .update(Buffer.concat([authData, sha256(clientData)]))
      .sign({ key: privateKey, format: "der", type: "pkcs8" }),
  );
  const assertion = (challenge, { forRpId, forOrigin, verified }) => {
    const clientData = Buffer.from(JSON.stringify({
      type: "webauthn.get", challenge, origin: forOrigin ?? origin, crossOrigin: false,
    }));
    counter += 1;
    const authData = Buffer.concat([
      sha256(Buffer.from(forRpId ?? rpId, "utf8")),
      Buffer.from([UP | ((verified ?? userVerified) ? UV : 0)]),
      uint32(counter),
    ]);
    return {
      id: b64url(credentialId),
      rawId: b64url(credentialId),
      type: "public-key",
      authenticatorAttachment: "platform",
      response: {
        clientDataJSON: b64url(clientData),
        authenticatorData: b64url(authData),
        signature: sign(authData, clientData),
        userHandle: null,
      },
      clientExtensionResults: {},
    };
  };

  return {
    credentialId,
    aaguid,
    get counter() { return counter; },
    /** A `none`-attested registration for exactly this rpId/origin pair. */
    register(challenge) {
      const clientData = Buffer.from(JSON.stringify({
        type: "webauthn.create", challenge, origin, crossOrigin: false,
      }));
      counter = 0;
      const authData = Buffer.concat([
        rpIdHash,
        Buffer.from([UP | (userVerified ? UV : 0) | AT]),
        uint32(counter),
        aaguid,
        uint16(credentialId.length),
        credentialId,
        coseKey(point),
      ]);
      return {
        id: b64url(credentialId),
        rawId: b64url(credentialId),
        type: "public-key",
        authenticatorAttachment: "platform",
        response: {
          clientDataJSON: b64url(clientData),
          attestationObject: b64url(cbor(new Map([
            ["fmt", "none"], ["attStmt", new Map()], ["authData", authData],
          ]))),
          transports: ["internal"],
        },
        clientExtensionResults: {},
      };
    },
    assert: (challenge) => assertion(challenge, {}),
    assertForRp: (challenge, otherRpId) => assertion(challenge, { forRpId: otherRpId }),
    assertForOrigin: (challenge, otherOrigin) => assertion(challenge, { forOrigin: otherOrigin }),
    assertWithoutUserVerification: (challenge) => assertion(challenge, { verified: false }),
  };
}

module.exports = { createAuthenticator, b64url, unb64url, cbor, sha256 };

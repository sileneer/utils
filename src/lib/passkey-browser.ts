/**
 * The browser half of a passkey ceremony.
 *
 * The server speaks base64url and the WebAuthn API speaks byte buffers, and that is all
 * this module does: convert in, convert out, and say *why* a ceremony failed. No
 * authentication library is loaded here — the site talks to its own wrapper routes
 * everywhere else, and a passkey is no reason to start otherwise.
 */
export type WebAuthnOptions = {
  challenge: string;
  rp?: { id?: string; name?: string };
  user?: { id: string; name?: string; displayName?: string };
  pubKeyCredParams?: { type: "public-key"; alg: number }[];
  timeout?: number;
  excludeCredentials?: { id: string; type?: string; transports?: string | string[] }[];
  allowCredentials?: { id: string; type?: string; transports?: string | string[] }[];
  authenticatorSelection?: Record<string, unknown>;
  attestation?: string;
  userVerification?: string;
};

export type SerializedCredential = {
  id: string;
  rawId: string;
  type: string;
  authenticatorAttachment: string | null;
  response: Record<string, unknown>;
  clientExtensionResults: Record<string, unknown>;
};

/** Why the browser could not produce a credential. Each one needs different words. */
export type CeremonyFailure = "unsupported" | "insecure" | "cancelled" | "failed";

/** base64url arrives unpadded, which `atob` rejects, so restore the padding first. */
const bytes = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const text = (value: ArrayBuffer | Uint8Array) => {
  const view = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/**
 * `id` must reach the browser as bytes or the ceremony throws before the person is ever
 * prompted. `transports` arrives as an array from the server (measured:
 * `{"transports":["internal"]}`); assuming a splittable string breaks every registration
 * after an account's first one, and only in a browser.
 */
const descriptors = (items: WebAuthnOptions["excludeCredentials"]): PublicKeyCredentialDescriptor[] =>
  (items ?? []).map((item) => {
    const transports = (typeof item.transports === "string"
      ? item.transports.split(",")
      : item.transports ?? []).filter(Boolean) as AuthenticatorTransport[];
    return { type: "public-key", id: bytes(item.id), ...(transports.length ? { transports } : {}) };
  });

/** A public-key credential is only usable from a secure context, and `localhost` counts. */
export function passkeySupport(): { available: boolean; reason: CeremonyFailure | null } {
  if (typeof window === "undefined") return { available: false, reason: "unsupported" };
  if (!window.isSecureContext) return { available: false, reason: "insecure" };
  if (!("PublicKeyCredential" in window) || !navigator.credentials) return { available: false, reason: "unsupported" };
  return { available: true, reason: null };
}

function failureOf(error: unknown): CeremonyFailure {
  const name = (error as { name?: string } | null)?.name;
  // NotAllowedError is what every current browser reports when the person dismisses the
  // dialog, walks away, or lets it time out. It is a choice, not a malfunction.
  if (name === "NotAllowedError") return "cancelled";
  if (name === "NotSupportedError" || name === "InvalidStateError") return "unsupported";
  return "failed";
}

/** Asks the browser to create a credential. Throws {@link CeremonyError} with a cause. */
export async function createPasskey(options: WebAuthnOptions): Promise<SerializedCredential> {
  const created = await run(() => navigator.credentials.create({
    publicKey: {
      challenge: bytes(options.challenge),
      rp: { name: options.rp?.name ?? "", ...(options.rp?.id ? { id: options.rp.id } : {}) },
      user: {
        id: bytes(options.user?.id ?? ""),
        name: options.user?.name ?? "",
        displayName: options.user?.displayName ?? options.user?.name ?? "",
      },
      pubKeyCredParams: options.pubKeyCredParams?.length
        ? options.pubKeyCredParams
        : [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      ...(options.timeout ? { timeout: options.timeout } : {}),
      excludeCredentials: descriptors(options.excludeCredentials),
      authenticatorSelection: options.authenticatorSelection as AuthenticatorSelectionCriteria | undefined,
      attestation: (options.attestation ?? "none") as AttestationConveyancePreference,
    },
  }));
  return serialize(created);
}

/** Asks the browser to sign an assertion. */
export async function requestPasskey(options: WebAuthnOptions): Promise<SerializedCredential> {
  const asserted = await run(() => navigator.credentials.get({
    publicKey: {
      challenge: bytes(options.challenge),
      ...(options.rp?.id ? { rpId: options.rp.id } : {}),
      ...(options.timeout ? { timeout: options.timeout } : {}),
      // Absent means "any passkey for this site", which is what a passwordless sign-in
      // needs; the server only sends the account's own list when it already knows them.
      ...(options.allowCredentials?.length
        ? { allowCredentials: descriptors(options.allowCredentials) }
        : {}),
      userVerification: (options.userVerification ?? "required") as UserVerificationRequirement,
    },
  }));
  return serialize(asserted);
}

/** Turns a {@link CeremonyFailure} into something the caller can switch on. */
export class CeremonyError extends Error {
  constructor(readonly reason: CeremonyFailure) {
    super(reason);
  }
}

async function run(action: () => Promise<Credential | null>) {
  const support = passkeySupport();
  if (!support.available) throw new CeremonyError(support.reason ?? "unsupported");
  let credential: Credential | null;
  try {
    credential = await action();
  } catch (error) {
    if (error instanceof CeremonyError) throw error;
    throw new CeremonyError(failureOf(error));
  }
  if (!credential) throw new CeremonyError("cancelled");
  return credential;
}

function serialize(credential: Credential): SerializedCredential {
  const key = credential as PublicKeyCredential;
  const response = key.response as unknown as Record<string, unknown>;
  // Named fields, not `Object.entries`: `clientDataJSON` and `attestationObject` are
  // prototype getters, so enumerating own properties yields an empty object and the
  // server receives a credential with nothing in it.
  const fields: Record<string, unknown> = {};
  for (const name of ["clientDataJSON", "attestationObject", "authenticatorData", "signature", "userHandle"]) {
    const value = response[name];
    if (value instanceof ArrayBuffer) fields[name] = text(new Uint8Array(value));
    else if (ArrayBuffer.isView(value)) fields[name] = text(value as Uint8Array);
    else if (typeof value === "string") fields[name] = value;
  }
  // Left as an array on purpose: the server joins it, and a string here would make its
  // `transports?.join(",")` throw — a browser-only failure, since no browser sends a
  // joined string.
  const transports = (key.response as AuthenticatorAttestationResponse).getTransports?.();
  if (transports) fields.transports = [...transports];
  return {
    id: key.id,
    rawId: text(key.rawId),
    type: key.type,
    authenticatorAttachment: key.authenticatorAttachment ?? null,
    response: fields,
    clientExtensionResults: { ...(key.getClientExtensionResults?.() ?? {}) },
  };
}

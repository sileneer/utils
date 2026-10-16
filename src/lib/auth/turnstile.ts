/**
 * Cloudflare Turnstile verification shared by the public auth routes and the account
 * wrapper's mail-sending operations, so a challenge can never be accepted on one
 * surface and rejected on the other.
 */
export type ChallengeResult =
  | "ok"
  | "unconfigured"
  | "missing"
  | "failed"
  | "unreachable";

const TEST_SITE_KEY = "1x00000000000000000000AA";

export async function verifyChallenge(
  token: unknown,
  ip: string,
  origin: string,
): Promise<ChallengeResult> {
  const siteKey = process.env.TURNSTILE_SITE_KEY,
    secret = process.env.TURNSTILE_SECRET_KEY;
  if (!siteKey || !secret) return "unconfigured";
  if (typeof token !== "string" || !token || token.length > 2048) return "missing";
  let verification: { success?: unknown; hostname?: unknown } | undefined;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          secret,
          response: token,
          ...(ip !== "local" && ip !== "unknown" ? { remoteip: ip } : {}),
        }),
      },
    );
    verification = await response.json();
  } catch {
    // An unreachable verifier is a service failure, not a user error.
    return "unreachable";
  }
  // Cloudflare's always-passing key is the only loopback QA path; a real key must
  // still report the site's own hostname.
  const testKey = siteKey === TEST_SITE_KEY && !origin.startsWith("https://");
  if (!verification?.success) return "failed";
  if (!testKey && verification.hostname !== new URL(origin).hostname) return "failed";
  return "ok";
}

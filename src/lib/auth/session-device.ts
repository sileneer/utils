import { db } from "../db";

/**
 * Records the signing-in request's own User-Agent on a session the plugin created
 * without request context.
 *
 * Both the two-factor and the passkey paths build the post-ceremony session inside the
 * library, and neither call passes the request through, so the row lands with an empty
 * user agent — which would make every such login read as "Unknown" in the login-sessions
 * list and in the security record. The request that finishes the ceremony *is* the
 * sign-in, so this is the same value an ordinary password sign-in stores, not a claim
 * about a device.
 *
 * A failure here is presentation only and must never turn a completed sign-in into an
 * error, so nothing is rethrown.
 */
export function recordSessionDevice(setCookie: string[], userAgent: string | null) {
  const token = setCookie
    .map((value) => /better-auth\.session_token=([^;.]+)/.exec(value)?.[1])
    .find(Boolean);
  if (!token) return;
  try {
    db().prepare("UPDATE session SET userAgent=? WHERE token=?").run(userAgent ?? "", token);
  } catch {
    /* The session stands either way. */
  }
}

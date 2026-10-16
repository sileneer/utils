/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * The site's single keyed-digest construction.
 *
 * It lives here, in plain CommonJS, because both halves of the codebase need the *same*
 * digest: every rate-limit bucket and mail-metadata row is addressed by it, and the
 * account-deletion engine — which must run from `migrate()`, before the TypeScript runtime
 * exists — has to recognise the rows it is being asked to remove. Two implementations of a
 * security-relevant digest would be one too many.
 *
 * The key is `BETTER_AUTH_SECRET`, so this value is only reproducible on this deployment:
 * the digest cannot be used to link a person across sites, and rotating the secret changes
 * every bucket boundary at once (ARCHITECTURE §8).
 */
const { createHmac } = require("node:crypto");

function privateKey(value) {
  return createHmac("sha256", process.env.BETTER_AUTH_SECRET)
    .update(String(value))
    .digest("hex");
}

module.exports = { privateKey };

import { createHmac } from "node:crypto";
import { emailOTP, twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { APIError } from "@better-auth/core/error";

/**
 * The passkey plugin hardcodes `requireUserVerification: false` on both verify endpoints,
 * so an assertion from an authenticator that skipped verification would still sign the
 * user in. This hook runs before any row is written or session is issued, so refusing
 * here leaves nothing behind — measured against the installed version.
 *
 * It is the only thing standing between "someone copied the private key off a synced
 * passkey" and a session, because a copied key still signs.
 */
function requireUserVerified({ verification }) {
  const info = verification?.registrationInfo ?? verification?.authenticationInfo;
  if (info?.userVerified !== true) {
    throw new APIError("UNAUTHORIZED", {
      message: "Passkey ceremony was not user verified",
      code: "PASSKEY_NOT_USER_VERIFIED",
    });
  }
}

/** Shared with schema generation; no secrets or database opened at import time. */
export function authOptions(database, secret, sendVerificationOTP) {
  const baseURL = process.env.APP_URL || "http://localhost:3000";
  return {
    appName: "Utils",
    database,
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    disabledPaths: [
      "/sign-in/email-otp",
      "/email-otp/create-verification-otp",
      "/email-otp/get-verification-otp",
      "/email-otp/check-verification-otp",
      "/request-password-reset",
      "/reset-password",
      "/send-verification-email",
      "/verify-email",
    ],
    logger: { disabled: true },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      autoSignInAfterVerification: false,
      sendOnSignUp: false,
      sendOnSignIn: false,
    },
    user: {
      additionalFields: {
        role: {
          type: /** @type {const} */ ("string"),
          defaultValue: "user",
          input: false,
        },
        status: {
          type: /** @type {const} */ ("string"),
          defaultValue: "active",
          input: false,
        },
      },
    },
    session: { freshAge: 60 * 60 * 24, expiresIn: 60 * 60 * 24 * 14, cookieCache: { enabled: false } },
    rateLimit: {
      enabled: true,
      storage: /** @type {const} */ ("database"),
      window: 60,
      max: 30,
    },
    advanced: {
      useSecureCookies: baseURL.startsWith("https://"),
      ipAddress: { ipAddressHeaders: ["x-utils-client-ip"] },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        disableSignUp: true,
        sendVerificationOnSignUp: false,
        overrideDefaultEmailVerification: false,
        resendStrategy: "rotate",
        rateLimit: { window: 60, max: 10 },
        storeOTP: {
          hash: async (otp) =>
            createHmac("sha256", secret).update(otp).digest("hex"),
        },
        sendVerificationOTP,
      }),
      // TOTP and recovery codes only. No otpOptions, so no second factor ever sends
      // mail and `twoFactorMethods` can only ever list totp; no skipVerificationOnEnable,
      // so enrolment stays incomplete until an authenticator code is proven.
      twoFactor({
        issuer: "Utils",
        totpOptions: { period: 30, digits: 6 },
        backupCodeOptions: { amount: 10, length: 10 },
      }),
      // rpID and origin are pinned from server configuration rather than inferred: the
      // plugin would otherwise take the caller's own `Origin` header as the expected
      // value. `residentKey: required` because a credential this site logs in with has
      // to be discoverable without an email, and failing at registration is honest while
      // failing silently at login is not.
      passkey({
        rpID: new URL(baseURL).hostname,
        origin: baseURL,
        authenticatorSelection: {
          residentKey: "required",
          userVerification: "required",
        },
        registration: { afterVerification: requireUserVerified },
        authentication: { afterVerification: requireUserVerified },
      }),
    ],
  };
}

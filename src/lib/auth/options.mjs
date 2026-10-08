import { createHmac } from "node:crypto";
import { emailOTP } from "better-auth/plugins";

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
      minPasswordLength: 12,
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
    session: { expiresIn: 60 * 60 * 24 * 14, cookieCache: { enabled: false } },
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
    ],
  };
}

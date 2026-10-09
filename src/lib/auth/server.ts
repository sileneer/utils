import { betterAuth } from "better-auth";
import { headers } from "next/headers";
import { authOptions } from "./options.mjs";
import { db } from "../db";
import { sendOTP } from "./mail";
import { beforePasswordWrite, isPasswordChange } from "./lifecycle";
function createAuth(secret: string) {
  return betterAuth({
    ...authOptions(db(), secret, sendOTP),
    databaseHooks: {
      account: {
        update: { before: async (data) => {
          if (typeof data.password === "string") await beforePasswordWrite();
        } },
        create: { before: async () => {
          // Credential recovery can create a missing account after OTP validation.
          if (isPasswordChange()) await beforePasswordWrite();
        } },
      },
    },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("auth_unconfigured");
  return (instance ??= createAuth(secret));
}
export async function currentUser() {
  try {
    const session = await getAuth().api.getSession({
      headers: await headers(),
    });
    if (!session?.user.emailVerified) return null;
    const row = db()
      .prepare("SELECT status FROM user WHERE id=?")
      .get(session.user.id) as { status: string } | undefined;
    return row?.status === "active" ? session.user : null;
  } catch {
    return null;
  }
}

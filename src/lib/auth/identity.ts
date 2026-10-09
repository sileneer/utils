import { db } from "../db";
import { getAuth } from "./server";

export type AccountUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  isAdmin: boolean;
};

/** Authoritative database projection; never return a session token or cached role. */
export async function accountSession(headers: Headers) {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  const user = db().prepare(
    "SELECT id,name,email,emailVerified,createdAt,role,status FROM user WHERE id=?",
  ).get(session.user.id) as {
    id: string; name: string; email: string; emailVerified: number;
    createdAt: number; role: string; status: string;
  } | undefined;
  if (!user?.emailVerified || user.status !== "active") return null;
  return {
    session: session.session,
    user: {
      id: user.id, name: user.name, email: user.email, emailVerified: true,
      createdAt: new Date(user.createdAt).toISOString(), isAdmin: user.role === "admin",
    } satisfies AccountUser,
  };
}

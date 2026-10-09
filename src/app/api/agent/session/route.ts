import { currentUser } from "@/lib/agent/auth";
import {
  isValidSessionId,
  loadSession,
  sessionExists,
} from "@/lib/agent/sessions";
import { activeTurn } from "@/lib/agent/active-query";
import { availability } from "@/lib/agent/usage";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await currentUser(),
    id = new URL(request.url).searchParams.get("id");
  const headers = { "cache-control": "no-store" };
  if (!user)
    return Response.json(
      { authed: false, user: null },
      { status: id ? 401 : 200, headers },
    );
  if (id && !isValidSessionId(id))
    return Response.json({ error: "bad_request" }, { status: 400, headers });
  const active = activeTurn(user.id);
  const session = id ? await loadSession(id, user.id) : null;
  // An owned request can be preparing its first persisted exchange. Existing
  // foreign conversations never use this provisional empty representation.
  if (id && !session && !(active?.sessionId === id && !sessionExists(id)))
    return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json(
    {
      authed: true,
      user: { id: user.id, email: user.email, name: user.name },
      availability: availability(user.id),
      ...(active ? { active } : {}),
      ...(id
        ? {
            session: {
              id,
              messages: session?.messages ?? [],
              revision: session?.revision,
              title: session?.title ?? "",
              archived: session?.archived ?? false,
            },
          }
        : {}),
    },
    { headers },
  );
}

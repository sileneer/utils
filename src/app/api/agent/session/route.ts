import { currentUser } from "@/lib/agent/auth";
import { isValidSessionId, loadSession } from "@/lib/agent/sessions";
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
  const session = id ? await loadSession(id, user.id) : null;
  if (id && !session)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json(
    {
      authed: true,
      user: { id: user.id, email: user.email, name: user.name },
      ...(session
        ? {
            session: {
              id: session.id,
              messages: session.messages,
              revision: session.revision,
            },
          }
        : {}),
    },
    { headers },
  );
}

import { currentUser } from "@/lib/agent/auth";
import {
  listConversations,
  updateConversation,
} from "@/lib/agent/conversations";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };
export async function GET(request: Request) {
  const owner = await currentUser();
  if (!owner)
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const params = new URL(request.url).searchParams;
  if (params.has("archived") && !["0", "1"].includes(params.get("archived")!))
    return Response.json({ error: "bad_request" }, { status: 400, headers });
  try {
    return Response.json(
      listConversations(
        owner.id,
        params.get("q") ?? "",
        params.get("archived") === "1",
        params.get("cursor") ?? undefined,
      ),
      { headers },
    );
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400, headers });
  }
}
export async function PATCH(request: Request) {
  const owner = await currentUser();
  if (!owner)
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  if (
    request.headers.get("origin") !==
    (process.env.APP_URL || new URL(request.url).origin)
  )
    return Response.json({ error: "forbidden" }, { status: 403, headers });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400, headers });
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.id !== "string" ||
    (body.title !== undefined && typeof body.title !== "string") ||
    (body.archived !== undefined && typeof body.archived !== "boolean")
  )
    return Response.json({ error: "bad_request" }, { status: 400, headers });
  try {
    updateConversation(owner.id, body.id, {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.archived !== undefined ? { archived: body.archived } : {}),
    });
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return Response.json(
      { error: ["not_found", "busy"].includes(code) ? code : "bad_request" },
      {
        status: code === "not_found" ? 404 : code === "busy" ? 409 : 400,
        headers,
      },
    );
  }
}

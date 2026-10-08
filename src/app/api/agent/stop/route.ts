import { NextResponse } from "next/server";
import { currentUser } from "@/lib/agent/auth";
import { stopQuery } from "@/lib/agent/active-query";
import { isValidSessionId } from "@/lib/agent/sessions";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const owner = await currentUser();
  if (!owner)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const origin = process.env.APP_URL || new URL(request.url).origin;
  if (request.headers.get("origin") !== origin)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (typeof body?.turnId !== "string" || !isValidSessionId(body.turnId))
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  return NextResponse.json(
    { stopped: stopQuery(owner.id, body.turnId) },
    { headers: { "cache-control": "no-store" } },
  );
}

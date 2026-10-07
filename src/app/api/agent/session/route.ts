import { NextResponse } from "next/server";

import { isAuthed } from "@/lib/agent/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  let authed = false;
  try {
    authed = await isAuthed();
  } catch {
    authed = false;
  }
  return NextResponse.json({ authed });
}

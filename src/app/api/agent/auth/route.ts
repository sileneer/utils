export function POST() {
  return Response.json({ error: "passcode_retired" }, { status: 410 });
}

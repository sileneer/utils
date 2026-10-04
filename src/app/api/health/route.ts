import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  // Deploy-rollback drill switch: setting DRILL_FAIL_HEALTH=1 in the container
  // env makes this endpoint return 503 so deploy.sh's healthcheck gate fails
  // on purpose. Remove the env var to restore normal behavior.
  if (process.env.DRILL_FAIL_HEALTH === "1") {
    return NextResponse.json({ status: "drill-fail" }, { status: 503 });
  }
  return NextResponse.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}

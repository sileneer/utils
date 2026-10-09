import { currentUser } from "@/lib/agent/auth";
import { isAdministrator } from "@/lib/admin/access";
import { operationsSnapshot } from "@/lib/admin/operations";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store", "vary": "Cookie" };
export async function GET(request: Request) {
    const user = await currentUser();
    if (!user)
        return Response.json({ error: "unauthorized" }, { status: 401, headers });
    try {
        if (!isAdministrator(user.id))
            return Response.json({ error: "forbidden" }, { status: 403, headers });
        const value = new URL(request.url).searchParams.get("hours") ?? "24";
        if (value !== "24" && value !== "168")
            return Response.json({ error: "bad_request" }, { status: 400, headers });
        return Response.json(await operationsSnapshot(Number(value) as 24 | 168), { headers });
    }
    catch {
        return Response.json({ error: "service_unavailable" }, { status: 503, headers });
    }
}

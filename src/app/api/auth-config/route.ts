export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      siteKey: process.env.TURNSTILE_SITE_KEY ?? "",
      available: Boolean(
        process.env.BETTER_AUTH_SECRET &&
        process.env.BREVO_API_KEY &&
        process.env.MAIL_FROM &&
        process.env.TURNSTILE_SECRET_KEY &&
        process.env.TURNSTILE_SITE_KEY,
      ),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

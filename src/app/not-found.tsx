import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="font-display text-5xl font-semibold tracking-tight text-muted-foreground/40">
        404
      </p>
      <p className="text-sm text-muted-foreground">
        This page does not exist (yet).
      </p>
      <Link
        href="/"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        Back to tools
      </Link>
    </div>
  );
}

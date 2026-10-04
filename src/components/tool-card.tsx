import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Tool } from "@/lib/tools";

export function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;

  const body = (
    <>
      <div className="flex items-start justify-between">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
        {tool.status === "planned" ? (
          <Badge variant="secondary">Soon</Badge>
        ) : (
          <ArrowUpRight className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="space-y-1">
        <p className="font-medium">{tool.name}</p>
        <p className="text-sm text-muted-foreground">{tool.description}</p>
      </div>
    </>
  );

  if (tool.status !== "live") {
    return (
      <div aria-disabled="true" className="rounded-xl opacity-70 select-none">
        <Card size="sm" className="h-full">
          <CardContent className="flex h-full flex-col gap-3">{body}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Link
      href={`/${tool.slug}`}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card
        size="sm"
        className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-sm"
      >
        <CardContent className="flex h-full flex-col gap-3">{body}</CardContent>
      </Card>
    </Link>
  );
}

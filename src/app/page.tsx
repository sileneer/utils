import { ToolCard } from "@/components/tool-card";
import { tools } from "@/lib/tools";

export default function HomePage() {
  return (
    <>
      <section className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          Utilities for everyday work
        </h1>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          Self-hosted tools from the{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href="https://lzhdev.com"
            target="_blank"
            rel="noreferrer"
          >
            lzhdev.com
          </a>{" "}
          family — fast, private, and open source. The first tools and the AI
          agent chat are on their way.
        </p>
      </section>
      <section aria-label="Tools" className="mt-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tools.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </section>
    </>
  );
}

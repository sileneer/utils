import { useTranslations } from "next-intl";

import { HomeAccount } from "@/components/auth/home-account";
import { ToolCard } from "@/components/tool-card";
import { tools } from "@/lib/tools";

export default function HomePage() {
  const t = useTranslations("home");

  return (
    <>
      <section className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          {t.rich("subtitle", {
            link: (chunks) => (
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href="https://lzhdev.com"
                target="_blank"
                rel="noreferrer"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </section>
      <HomeAccount />
      <section aria-label={t("title")} className="mt-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tools.map((tool) => (
            <ToolCard key={tool.slug} tool={tool} />
          ))}
        </div>
      </section>
    </>
  );
}

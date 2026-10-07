import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
  return { title: t("title") };
}

export default function AboutPage() {
  const t = useTranslations("about");

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t("title")}
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
        {t.rich("p1", {
          owner: (chunks) => (
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
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
        {t("p2")}
      </p>
      <ul className="space-y-2 text-sm">
        <li>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://github.com/sileneer/utils"
            target="_blank"
            rel="noreferrer"
          >
            {t("repoLabel")}
          </a>{" "}
          <span className="text-muted-foreground">{t("repoNote")}</span>
        </li>
        <li>
          <a
            className="text-primary underline-offset-4 hover:underline"
            href="https://lzhdev.com"
            target="_blank"
            rel="noreferrer"
          >
            {t("siteLabel")}
          </a>{" "}
          <span className="text-muted-foreground">{t("siteNote")}</span>
        </li>
      </ul>
    </div>
  );
}

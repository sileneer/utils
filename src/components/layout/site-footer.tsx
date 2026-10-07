import { useTranslations } from "next-intl";

import { GithubIcon } from "@/components/icons/github-icon";

export function SiteFooter() {
  const t = useTranslations("common");

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-4 px-4 py-6 text-xs text-muted-foreground md:px-6 lg:px-8">
        <a
          className="transition-colors hover:text-foreground"
          href="https://lzhdev.com"
          target="_blank"
          rel="noreferrer"
        >
          lzhdev.com
        </a>
        <a
          className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
          href="https://github.com/sileneer/utils"
          target="_blank"
          rel="noreferrer"
        >
          <GithubIcon className="size-3.5" />
          {t("openSource")}
        </a>
      </div>
    </footer>
  );
}

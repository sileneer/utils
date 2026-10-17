import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { TextDiffTool } from "@/components/text-diff/tool";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tools");
  return {
    title: t("text-diff.name"),
    description: t("text-diff.description"),
  };
}

export default function TextDiffPage() {
  const t = useTranslations("tools");

  return (
    <>
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {t("text-diff.name")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          {t("text-diff.description")}
        </p>
      </header>
      <div className="mt-10">
        <TextDiffTool />
      </div>
    </>
  );
}

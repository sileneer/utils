import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { JsonFormatterTool } from "@/components/json-formatter/tool";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tools");
  return {
    title: t("json-formatter.name"),
    description: t("json-formatter.description"),
  };
}

export default function JsonFormatterPage() {
  const t = useTranslations("tools");

  return (
    <>
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {t("json-formatter.name")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          {t("json-formatter.description")}
        </p>
      </header>
      <div className="mt-10">
        <JsonFormatterTool />
      </div>
    </>
  );
}

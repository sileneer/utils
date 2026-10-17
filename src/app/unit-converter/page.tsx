import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { UnitConverterTool } from "@/components/unit-converter/tool";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tools");
  return {
    title: t("unit-converter.name"),
    description: t("unit-converter.description"),
  };
}

export default function UnitConverterPage() {
  const t = useTranslations("tools");

  return (
    <>
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {t("unit-converter.name")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          {t("unit-converter.description")}
        </p>
      </header>
      <div className="mt-10">
        <UnitConverterTool />
      </div>
    </>
  );
}

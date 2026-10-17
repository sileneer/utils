import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { QrStudioTool } from "@/components/qr-studio/tool";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tools");
  return {
    title: t("qr-studio.name"),
    description: t("qr-studio.description"),
  };
}

export default function QrStudioPage() {
  const t = useTranslations("tools");

  return (
    <>
      <header className="max-w-2xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
          {t("qr-studio.name")}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          {t("qr-studio.description")}
        </p>
      </header>
      <div className="mt-10">
        <QrStudioTool />
      </div>
    </>
  );
}

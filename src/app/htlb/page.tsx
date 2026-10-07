import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ReadingShell } from "@/components/htlb/reading-shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("htlb");
  return { title: t("title") };
}

export default function HtlbPage() {
  return <ReadingShell />;
}

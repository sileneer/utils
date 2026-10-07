import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="font-display text-5xl font-semibold tracking-tight text-muted-foreground/40">
        {t("code")}
      </p>
      <p className="text-sm text-muted-foreground">{t("message")}</p>
      <Link
        href="/"
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        {t("back")}
      </Link>
    </div>
  );
}
